import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";

import { account, user } from "../../src/core/auth";
import type { Orm } from "../../src/core/db";
import { files } from "../../src/core/files";
import { hashSetupToken, instanceRepository } from "../../src/core/instance";
import { type Employee, employeeRepository, type NewEmployee } from "../../src/modules/employees";
import { importRepository, type ImportEmployeeValues } from "../../src/modules/imports";
import { slackConnectionRepository } from "../../src/modules/slack";
import { parseCalendarDate } from "../../src/utils";
import { TEST_SECRET_BOX } from "./testSecretBox";
import { TestSecurityContext } from "./testSecurityContext";

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
    await instanceRepository(this.orm).setOwner(userId, "company");
    return new TestSecurityContext({ user: { userId, email: normalisedEmail, isOwner: true } });
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

  async file({ content, mimeType }: { content: Buffer; mimeType: string }): Promise<string> {
    const [file] = await this.orm
      .insert(files)
      .values({ content, mimeType })
      .returning({ id: files.id });
    return file!.id;
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
    const repository = importRepository(this.orm);
    const id = await repository.saveSlackSource(name);
    const [source] = await repository.findSources([id]);
    return source!;
  }

  async fileSource({
    name = "staff.csv",
    content,
    status = "mapping",
    attempt = 0,
    failure = null,
  }: {
    name?: string;
    content: string | Uint8Array;
    status?: "mapping" | "mapped" | "failed";
    attempt?: number;
    failure?: "no_people_columns" | "unavailable" | null;
  }) {
    const fileId = await this.file({
      content: Buffer.from(content),
      mimeType:
        typeof content === "string"
          ? "text/csv"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const repository = importRepository(this.orm);
    const id = await repository.insertFileSource(name, fileId);
    for (let previous = 0; previous < attempt; previous++) {
      await repository.finishMapping(id, previous, { status: "failed", failure: "unavailable" });
      await repository.restartMapping(id);
    }
    if (status === "failed") {
      await repository.finishMapping(id, attempt, { status, failure: failure ?? "unavailable" });
    } else if (status === "mapped") {
      await repository.finishMapping(id, attempt, { status });
    }
    const [source] = await repository.findSources([id]);
    return source!;
  }

  async importEmployees(
    sourceId: string,
    employees: (Partial<ImportEmployeeValues> & { externalId?: string })[],
  ) {
    const repository = importRepository(this.orm);
    await repository.syncEmployeeRecords(
      sourceId,
      employees.map(({ externalId, ...values }) => {
        const number = ++this.#count;
        return {
          externalId: externalId ?? `U${number}`,
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
    const records = await repository.findEmployeePage({
      first: employees.length,
      after: null,
      order: { field: "NAME", direction: "ASC" },
      search: null,
      sourceId,
    });
    return records.map(({ node }) => node);
  }

  slackConnection(accessToken = "test-slack-token") {
    return slackConnectionRepository(this.orm).save({
      teamId: "T1",
      teamName: "Acme Workspace",
      encryptedToken: TEST_SECRET_BOX.encrypt(accessToken),
    });
  }
}

function calendarDate(value: string) {
  const date = parseCalendarDate(value);
  if (!date) {
    throw new Error(`Seed start date ${value} is not a calendar date`);
  }
  return date;
}
