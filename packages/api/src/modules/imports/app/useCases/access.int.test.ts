import { expect, NON_OWNER, importUseCases, test } from "#test/support";

import type { SecurityContext } from "../../../../core/security";

type ImportUseCases = ReturnType<typeof importUseCases>;

const calls = {
  readSlack: (imports, ctx) => imports.readSlack(ctx),
  listSources: (imports, ctx) => imports.listSources(ctx),
  readSources: (imports, ctx) => imports.readSources(ctx, []),
  countEmployees: (imports, ctx) => imports.countEmployees(ctx, []),
  listEmployees: (imports, ctx) => imports.listEmployees(ctx, {}),
  skipImport: (imports, ctx) => imports.skipImport(ctx),
} satisfies Record<
  keyof ImportUseCases,
  (imports: ImportUseCases, ctx: SecurityContext) => unknown
>;

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
