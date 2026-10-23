import { expect, NON_OWNER, importUseCases, test } from "#test/support";

import type { Tx } from "../../../../core/db";
import type { SecurityContext } from "../../../../core/security";

// The external agent's operations admit their own callers; their tests check them. The demo
// start takes no caller: the start it returns checks the caller setup runs it with.
type ImportUseCases = Omit<
  ReturnType<typeof importUseCases>,
  "reportAddedPeople" | "sentJobs" | "answeredMapping" | "originalFileReads" | "prepareDemoStart"
> & {
  originalFileReads: Omit<
    ReturnType<typeof importUseCases>["originalFileReads"],
    "readOriginalBytes" | "addReadPeople"
  >;
};

/** Every use case by name; a service's as `service.name`, so none can be left out below. */
type UseCaseName = {
  [Name in keyof ImportUseCases]: ImportUseCases[Name] extends (...args: never[]) => unknown
    ? Name
    : `${Name}.${keyof ImportUseCases[Name] & string}`;
}[keyof ImportUseCases];

const calls = {
  "originalFileReads.allowOriginalFileRead": (imports, ctx) =>
    imports.originalFileReads.allowOriginalFileRead(ctx, "missing", "broccoli_ai"),
  "originalFileReads.readOriginalFile": (imports, ctx) =>
    imports.originalFileReads.readOriginalFile(ctx, {
      sourceId: "missing",
      attempt: 0,
      aiSource: null,
    }),
  "files.uploadFile": (imports, ctx) =>
    imports.files.uploadFile(ctx, { name: "staff.csv", bytes: Buffer.from("Name\nAvery Stone") }),
  "files.mapFile": (imports, ctx) =>
    imports.files.mapFile(ctx, { sourceId: "missing", attempt: 0 }),
  "files.markFileFailed": (imports, ctx) =>
    imports.files.markFileFailed(ctx, { sourceId: "missing", attempt: 0 }),
  "files.retryFile": (imports, ctx) => imports.files.retryFile(ctx, "missing"),
  removeSource: (imports, ctx) => imports.removeSource(ctx, "missing"),
  readSlack: (imports, ctx) => imports.readSlack(ctx),
  "reads.listSources": (imports, ctx) => imports.reads.listSources(ctx),
  "reads.readSources": (imports, ctx) => imports.reads.readSources(ctx, []),
  "reads.countEmployees": (imports, ctx) => imports.reads.countEmployees(ctx, []),
  "reads.readProgress": (imports, ctx) => imports.reads.readProgress(ctx),
  "reads.readReview": (imports, ctx) => imports.reads.readReview(ctx),
  "reads.listEmployeeRecords": (imports, ctx) =>
    imports.reads.listEmployeeRecords(ctx, { sourceId: "missing" }),
  "reads.readImportPhoto": (imports, ctx) =>
    imports.reads.readImportPhoto(ctx, "0199f6c4-0000-7000-8000-000000000000"),
  "choices.chooseEmployeeValue": (imports, ctx) =>
    imports.choices.chooseEmployeeValue(ctx, { key: "missing", field: "jobTitle", choice: null }),
  "choices.chooseSourceForAll": (imports, ctx) =>
    imports.choices.chooseSourceForAll(ctx, { field: "jobTitle", sourceId: "missing" }),
  "choices.setLeftOut": (imports, ctx) =>
    imports.choices.setLeftOut(ctx, { key: "missing", leftOut: true }),
  "choices.leaveOutIncomplete": (imports, ctx) =>
    imports.choices.leaveOutIncomplete(ctx, { reason: "email" }),
  startDemo: (imports, ctx) => imports.startDemo(ctx),
  addApprovedPeople: (imports, ctx, tx) => imports.addApprovedPeople(ctx, tx),
  approveImport: (imports, ctx) => imports.approveImport(ctx, "any-version"),
  finishImport: (imports, ctx) => imports.finishImport(ctx),
  deleteFinishedImport: (imports, ctx, tx) => imports.deleteFinishedImport(ctx, tx),
  reopenReview: (imports, ctx) => imports.reopenReview(ctx),
} satisfies Record<UseCaseName, (imports: ImportUseCases, ctx: SecurityContext, tx: Tx) => unknown>;

test.for(Object.entries(calls))(
  "%s refuses a signed-in user who is not the owner",
  async ([, call], { orm, transact }) => {
    const imports = importUseCases(orm);

    await expect(
      Promise.resolve().then(async () => {
        await transact(async (tx) => {
          await call(imports, NON_OWNER, tx);
        });
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Only the owner can do this.",
      fieldErrors: [],
    });
  },
);
