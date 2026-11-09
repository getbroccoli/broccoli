import type { Orm } from "../../src/core/db";
import { files } from "../../src/core/files";
import { instanceRepository } from "../../src/core/instance/db";
import type { AiSource, MailSource, SetupStep } from "../../src/core/instance/domain";
import { hashSetupToken } from "../../src/core/instance/helpers";
import { PrincipalSecurityContext, type SecurityContext } from "../../src/core/security";
import { employeeDirectory, type Employee } from "../../src/modules/employees";
import {
  employeeRepository,
  employmentRepository,
  locationRepository,
} from "../../src/modules/employees/db";
import { importPhotoRepository, importReader, lockImport } from "../../src/modules/imports/db";
import type { ImportEmployeeValues } from "../../src/modules/imports/domain";
import { slackConnectionRepository } from "../../src/modules/slack/db";
import { todayInUtc } from "../../src/utils";
import { calendarDate } from "./calendarDate";
import { TEST_SECRET_BOX } from "./testSecretBox";
import { defaultTermsId, insertTerms, leaveTerms, moveToTerms } from "./seedTerms";
import { seedUser } from "./seedUser";
import { seedTask } from "./seedTask";
import { testTransactor } from "./testTransactor";

type SeedEmployee = Partial<
  Omit<Employee, "id" | "createdAt" | "startDate"> & { startDate: string | null; isDemo: boolean }
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
    name,
  }: { email?: string; password?: string; name?: string } = {}): Promise<SecurityContext> {
    const saved = await this.user({ email, password, name });
    const instance = instanceRepository(this.orm);
    await instance.setOwner(saved.id, (await instance.readInstance()).step);
    return PrincipalSecurityContext.user(
      {
        userId: saved.id,
        email: saved.email,
        isOwner: true,
        permissionProfiles: ["EMPLOYEE", "OWNER"],
        employeeId: null,
      },
      employeeDirectory(this.orm),
    );
  }

  user(options: Parameters<typeof seedUser>[1]): Promise<{ id: string; email: string }> {
    return seedUser(this.orm, options);
  }

  async manager(employeeId: string, managerId: string | null): Promise<void> {
    await employmentRepository(this.orm).setManagers(
      new Map([[employeeId, managerId]]),
      todayInUtc(),
    );
  }

  /** Makes the instance managed, as the accounts service assigns it. */
  async assignment({ instanceCredential }: { instanceCredential?: string } = {}): Promise<void> {
    await instanceRepository(this.orm).setAssignment({
      companyId: "company-1",
      publicOrigin: "https://broccoli.example.com",
      websiteOrigin: "https://example.com",
    });
    if (instanceCredential !== undefined) {
      await instanceRepository(this.orm).saveInstanceCredential(
        TEST_SECRET_BOX.encrypt(instanceCredential),
      );
    }
  }

  /** Moves setup straight to `step`, whatever step it is at. */
  async setupStep(step: SetupStep): Promise<void> {
    const instance = instanceRepository(this.orm);
    await instance.advanceStep((await instance.readInstance()).step, step);
  }

  async demoOwner({ expiresAt }: { expiresAt: Date }): Promise<SecurityContext> {
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

  async mailSettings({
    source = "resend_api",
    from = "broccoli@example.com",
    secret = "resend-key",
    linkOrigin = "https://broccoli.example.com",
  }: {
    source?: MailSource;
    from?: string | null;
    secret?: string | null;
    linkOrigin?: string | null;
  } = {}): Promise<void> {
    await instanceRepository(this.orm).storeMailSettings({
      source,
      from,
      linkOrigin,
      encryptedSecret:
        source === "no_email" || secret === null ? null : TEST_SECRET_BOX.encrypt(secret),
    });
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

  location(name: string) {
    return testTransactor(this.orm)((tx) => locationRepository(tx).insert(name));
  }

  employee({
    startDate = null,
    avatarFileId = null,
    ...overrides
  }: SeedEmployee = {}): Promise<Employee> {
    const number = ++this.#count;
    return testTransactor(this.orm)((tx) =>
      employeeRepository(tx).insert({
        firstName: "Employee",
        lastName: String(number),
        email: `employee${number}@example.com`,
        jobTitle: null,
        locationId: null,
        startDate: startDate === null ? null : calendarDate(startDate),
        avatarFileId,
        ...overrides,
      }),
    );
  }

  task(overrides: Omit<Parameters<typeof seedTask>[1], "title"> & { title?: string }) {
    return seedTask(this.orm, { title: `Task ${++this.#count}`, ...overrides });
  }

  /** The id of the seeded "England and Wales" terms, which every new employee joins. */
  defaultTermsId = () => defaultTermsId(this.orm);

  /** New terms with no one on them. */
  terms = (name = `Terms ${++this.#count}`) => insertTerms(this.orm, name);

  /** Takes an employee off all terms, for all dates. */
  leaveTerms = (employeeId: string) => leaveTerms(this.orm, employeeId);

  /** Moves an employee onto only `termsId`, for all dates or from `from` with no terms before. */
  moveToTerms = (employeeId: string, termsId: string, from: string | null = null) =>
    moveToTerms(this.orm, { employeeId, termsId, from });

  /** `count` default employees in one insert. */
  employees(count: number): Promise<Employee[]> {
    const newEmployees = Array.from({ length: count }, () => {
      const number = ++this.#count;
      return {
        firstName: "Employee",
        lastName: String(number),
        email: `employee${number}@example.com`,
        jobTitle: null,
        locationId: null,
        startDate: null,
        avatarFileId: null,
      };
    });
    return testTransactor(this.orm)((tx) =>
      employeeRepository(tx).insertSkippingTakenEmails(newEmployees),
    );
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
      const id = await imports.insertFileSource(
        name,
        readBy,
        {
          content: Buffer.from(content),
          mimeType:
            typeof content === "string"
              ? "text/csv"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        "mapping",
      );
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
      sourceKey?: string;
      externalRecordId?: string | null;
      photoUrl?: string | null;
    })[],
  ) {
    await testTransactor(this.orm)(async (tx) => {
      const imports = await lockImport(tx);
      await imports.syncEmployeeRecords(
        sourceId,
        employees.map(({ sourceKey, externalRecordId = null, photoUrl, ...values }) => {
          const number = ++this.#count;
          return {
            sourceKey: sourceKey ?? `U${number}`,
            externalRecordId,
            photoUrl,
            raw: {},
            values: {
              firstName: "Employee",
              lastName: String(number),
              email: `employee${number}@example.com`,
              jobTitle: null,
              location: null,
              manager: null,
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

  slackConnection({
    accessToken = "test-slack-token",
    teamId = "T1",
    teamName = "Acme Workspace",
  }: { accessToken?: string; teamId?: string; teamName?: string } = {}) {
    return slackConnectionRepository(this.orm).save({
      teamId,
      teamName,
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
