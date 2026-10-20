import { expect, NON_OWNER, importUseCases, test } from "#test/support";

import type { SecurityContext } from "../../../../core/security";

type ImportUseCases = Omit<ReturnType<typeof importUseCases>, "sentJobs">;

/** Every use case by name; a service's as `service.name`, so none can be left out below. */
type UseCaseName = {
  [Name in keyof ImportUseCases]: ImportUseCases[Name] extends (...args: never[]) => unknown
    ? Name
    : `${Name}.${keyof ImportUseCases[Name] & string}`;
}[keyof ImportUseCases];

const calls = {
  "files.uploadFile": (imports, ctx) =>
    imports.files.uploadFile(ctx, { name: "staff.csv", bytes: Buffer.from("Name\nAvery Stone") }),
  "files.mapFile": (imports, ctx) =>
    imports.files.mapFile(ctx, { sourceId: "missing", attempt: 0 }),
  "files.markFileFailed": (imports, ctx) =>
    imports.files.markFileFailed(ctx, { sourceId: "missing", attempt: 0 }),
  "files.retryFile": (imports, ctx) => imports.files.retryFile(ctx, "missing"),
  "files.removeFile": (imports, ctx) => imports.files.removeFile(ctx, "missing"),
  readSlack: (imports, ctx) => imports.readSlack(ctx),
  "reads.listSources": (imports, ctx) => imports.reads.listSources(ctx),
  "reads.readSources": (imports, ctx) => imports.reads.readSources(ctx, []),
  "reads.countEmployees": (imports, ctx) => imports.reads.countEmployees(ctx, []),
  "reads.employeeCount": (imports, ctx) => imports.reads.employeeCount(ctx),
  "reads.readyEmployeeCount": (imports, ctx) => imports.reads.readyEmployeeCount(ctx),
  "reads.listEmployees": (imports, ctx) => imports.reads.listEmployees(ctx, {}),
  "reads.listEmployeeRecords": (imports, ctx) =>
    imports.reads.listEmployeeRecords(ctx, { sourceId: "missing" }),
  "reads.listChecks": (imports, ctx) => imports.reads.listChecks(ctx),
  "reads.isImportPhotoFile": (imports, ctx) =>
    imports.reads.isImportPhotoFile(ctx, "0199f6c4-0000-7000-8000-000000000000"),
  "choices.chooseEmployeeValue": (imports, ctx) =>
    imports.choices.chooseEmployeeValue(ctx, { key: "missing", field: "jobTitle", choice: null }),
  "choices.chooseSourceForAll": (imports, ctx) =>
    imports.choices.chooseSourceForAll(ctx, { field: "jobTitle", sourceId: "missing" }),
  "choices.setLeftOut": (imports, ctx) =>
    imports.choices.setLeftOut(ctx, { key: "missing", leftOut: true }),
  "choices.leaveOutIncomplete": (imports, ctx) =>
    imports.choices.leaveOutIncomplete(ctx, { reason: "email" }),
  startDemo: (imports, ctx) => imports.startDemo(ctx),
  approveImport: (imports, ctx) => imports.approveImport(ctx),
  finishImport: (imports, ctx) => imports.finishImport(ctx),
  resetSetup: (imports, ctx) => imports.resetSetup(ctx),
} satisfies Record<UseCaseName, (imports: ImportUseCases, ctx: SecurityContext) => unknown>;

test.for(Object.entries(calls))(
  "%s refuses a signed-in user who is not the owner",
  async ([, call], { orm }) => {
    const imports = importUseCases(orm);

    await expect(
      Promise.resolve().then(async () => {
        await call(imports, NON_OWNER);
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Only the owner can do this.",
      fieldErrors: [],
    });
  },
);
