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
  "files.canReadFiles": (imports, ctx) => imports.files.canReadFiles(ctx),
  readSlack: (imports, ctx) => imports.readSlack(ctx),
  "reads.listSources": (imports, ctx) => imports.reads.listSources(ctx),
  "reads.readSources": (imports, ctx) => imports.reads.readSources(ctx, []),
  "reads.countEmployees": (imports, ctx) => imports.reads.countEmployees(ctx, []),
  "reads.readyEmployeeCount": (imports, ctx) => imports.reads.readyEmployeeCount(ctx),
  "reads.listEmployees": (imports, ctx) => imports.reads.listEmployees(ctx, {}),
  skipImport: (imports, ctx) => imports.skipImport(ctx),
  approveImport: (imports, ctx) => imports.approveImport(ctx),
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
