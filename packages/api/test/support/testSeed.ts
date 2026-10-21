import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";

import { account, user } from "../../src/core/auth";
import type { Orm } from "../../src/core/db";
import { files } from "../../src/core/files";
import { type AiSource, hashSetupToken, type SetupStep } from "../../src/core/instance";
import { instanceRepository } from "../../src/core/instance/db";
import { type Employee, employeeRepository, type NewEmployee } from "../../src/modules/employees";
import {
  importPhotoRepository,
  importReader,
  lockImport,
  type ImportEmployeeValues,
} from "../../src/modules/imports";
import { slackConnectionRepository } from "../../src/modules/slack";
import { parseCalendarDate } from "../../src/utils";
import { TEST_SECRET_BOX } from "./testSecretBox";
import { TestSecurityContext } from "./testSecurityContext";
import { testTransactor } from "./testTransactor";

type SeedEmployee = Partial<
  Omit<NewEmployee, "startDate"> & { startDate: string | null; avatarFileId: string | null }
>;

/**
 * Creates test data by inserting through each module's repository, skipping use
 * cases, so setup does not depend on the code under test. Defaults are unique,
 * normalised demo values; a test sets only the fields it is about.
 */
export class TestSeed {
  #count = 0;

  constructor(private readonly orm: Orm) {}

  async owner({
    email = "owner@example.com",
    password,
  }: { email?: string; password?: string } = {}): Promise<TestSecurityContext> {
    const userId = randomUUID();
    const normalisedEmail = email.toLowerCase();
    await this.orm.insert(user).values({ id: userId, name: "Owner", email: normalisedEmail });
    if (password !== undefined) {
      await this.orm.insert(account).values({
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: await hashPassword(password),
      });
    }
    const instance = instanceRepository(this.orm);
    await instance.setOwner(userId, await instance.readStep());
    return new TestSecurityContext({ user: { userId, email: normalisedEmail, isOwner: true } });
  }

  /** Makes the instance managed, as the accounts service assigns it. */
  async assignment(): Promise<void> {
    await instanceRepository(this.orm).setAssignment({
      companyId: "company-1",
      publicOrigin: "https://broccoli.example.com",
      websiteOrigin: "https://example.com",
    });
  }

  /** Moves setup straight to `step`, whatever step it is at. */
  async setupStep(step: SetupStep): Promise<void> {
    const instance = instanceRepository(this.orm);
    await instance.advanceStep(await instance.readStep(), step);
  }

  async demoOwner({ expiresAt }: { expiresAt: Date }): Promise<TestSecurityContext> {
    const owner = await this.owner();
    await this.setupStep("done");
    await this.demoDeadline(expiresAt);
    return owner;
  }

  /** Sets when the provisional owner's demo ends. */
  async demoDeadline(expiresAt: Date): Promise<void> {
    await instanceRepository(this.orm).saveDemoExpiresAt(expiresAt);
  }

  async setupSession({
    token = "setup-token",
    expiresAt,
  }: {
    token?: string;
    expiresAt: Date;
  }): Promise<void> {
    await instanceRepository(this.orm).saveSetupSession({
      tokenHash: hashSetupToken(token),
      expiresAt,
    });
  }

  async aiSource(source: AiSource, openRouterKey?: string): Promise<void> {
    await instanceRepository(this.orm).storeAiSource(
      source,
      openRouterKey === undefined ? undefined : TEST_SECRET_BOX.encrypt(openRouterKey),
    );
  }

  async file({ content, mimeType }: { content: Buffer; mimeType: string }): Promise<string> {
    const [file] = await this.orm
      .insert(files)
      .values({ content, mimeType })
      .returning({ id: files.id });
    return file!.id;
  }

  async externalAgentSetup(): Promise<void> {
    const instance = instanceRepository(this.orm);
    await instance.advanceStep("company", "import");
    await this.setupSession({ expiresAt: new Date("2026-10-23T12:00:00Z") });
    await instance.storeAiSource("external_agent");
  }

  employee({
    startDate = null,
    avatarFileId = null,
    ...overrides
  }: SeedEmployee = {}): Promise<Employee> {
    const number = ++this.#count;
    return employeeRepository(this.orm).insert({
      firstName: "Employee",
      lastName: String(number),
      email: `employee${number}@example.com`,
      jobTitle: null,
      startDate: startDate === null ? null : calendarDate(startDate),
      avatarFileId,
      ...overrides,
    });
  }

  async importSource(name = "Acme Workspace") {
    const id = await testTransactor(this.orm)(async (tx) => {
      const imports = await lockImport(tx);
      return imports.saveSlackSource(name);
    });
    const [source] = await importReader(this.orm).findSources([id]);
    return source!;
  }

  async fileSource({
    name = "staff.csv",
    content,
    status = "mapping",
    attempt = 0,
    failure = null,
    failureMessage = null,
    readBy = "parsed_by_broccoli",
  }: {
    name?: string;
    content: string | Uint8Array;
    status?: "mapping" | "mapped" | "failed";
    attempt?: number;
    failure?: "no_people_columns" | "unavailable" | null;
    failureMessage?: string | null;
    readBy?: "parsed_by_broccoli" | "answered_by_external_agent";
  }) {
    const id = await testTransactor(this.orm)(async (tx) => {
      const imports = await lockImport(tx);
      const id = await imports.insertFileSource(name, readBy, {
        content: Buffer.from(content),
        mimeType:
          typeof content === "string"
            ? "text/csv"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      for (let previous = 0; previous < attempt; previous++) {
        await imports.finishMapping(id, previous, { status: "failed", failure: "unavailable" });
        await imports.restartMapping(id);
      }
      if (status === "failed") {
        await imports.finishMapping(id, attempt, {
          status,
          failure: failure ?? "unavailable",
          failureMessage,
        });
      } else if (status === "mapped") {
        await imports.finishMapping(id, attempt, { status });
      }
      return id;
    });
    const [source] = await importReader(this.orm).findSources([id]);
    return source!;
  }

  async importEmployees(
    sourceId: string,
    employees: (Partial<ImportEmployeeValues> & {
      externalId?: string;
      photoUrl?: string | null;
    })[],
  ) {
    await testTransactor(this.orm)(async (tx) => {
      const imports = await lockImport(tx);
      await imports.syncEmployeeRecords(
        sourceId,
        employees.map(({ externalId, photoUrl, ...values }) => {
          const number = ++this.#count;
          return {
            externalId: externalId ?? `U${number}`,
            photoUrl,
            raw: {},
            values: {
              firstName: "Employee",
              lastName: String(number),
              email: `employee${number}@example.com`,
              jobTitle: null,
              startDate: null,
              ...values,
            },
          };
        }),
      );
    });
    const records = await importReader(this.orm).listEmployeeRecords();
    return records.filter((record) => record.sourceId === sourceId);
  }

  slackConnection(accessToken = "test-slack-token") {
    return slackConnectionRepository(this.orm).save({
      teamId: "T1",
      teamName: "Acme Workspace",
      encryptedToken: TEST_SECRET_BOX.encrypt(accessToken),
    });
  }

  async importPhoto(
    recordId: string,
    { photoUrl, content, mimeType }: { photoUrl: string; content: Buffer; mimeType: string },
  ): Promise<string> {
    await testTransactor(this.orm)(async (tx) => {
      await lockImport(tx);
      const photos = importPhotoRepository(tx);
      if (!(await photos.attachPhoto(recordId, photoUrl, { content, mimeType }))) {
        throw new Error(`Could not seed the photo of import record ${recordId}`);
      }
    });
    const records = await importReader(this.orm).listEmployeeRecords();
    return records.find(({ id }) => id === recordId)!.photoFileId!;
  }
}

function calendarDate(value: string) {
  const date = parseCalendarDate(value);
  if (!date) {
    throw new Error(`Seed start date ${value} is not a calendar date`);
  }
  return date;
}
