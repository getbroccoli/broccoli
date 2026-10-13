import { expect, importUseCases, test } from "#test/support";

import type { Actor } from "../../../../core/actor";

type ImportUseCases = ReturnType<typeof importUseCases>;

const calls = {
  canConnectSlack: (imports, actor) => imports.canConnectSlack(actor),
  beginSlackConnection: (imports, actor) =>
    imports.beginSlackConnection(actor, "https://example.com/callback"),
  connectSlack: (imports, actor) =>
    imports.connectSlack(actor, { code: "test-code", codeVerifier: "test-verifier" }),
  refreshSlack: (imports, actor) => imports.refreshSlack(actor),
  listSources: (imports, actor) => imports.listSources(actor),
  readSources: (imports, actor) => imports.readSources(actor, []),
  countEmployees: (imports, actor) => imports.countEmployees(actor, []),
  listEmployees: (imports, actor) => imports.listEmployees(actor, {}),
  skipImport: (imports, actor) => imports.skipImport(actor),
} satisfies Record<keyof ImportUseCases, (imports: ImportUseCases, actor: Actor) => unknown>;

test.for(Object.entries(calls))(
  "%s refuses a signed-in user who is not the owner",
  async ([, call], { orm }) => {
    const imports = importUseCases(orm);

    await expect(
      Promise.resolve().then(async () => {
        await call(imports, { userId: "another-user", isOwner: false });
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Only the owner can do this.",
      fieldErrors: [],
    });
  },
);
