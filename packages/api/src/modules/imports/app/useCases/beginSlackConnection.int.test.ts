import { createHash } from "node:crypto";

import { expect, importUseCases, OWNER, test } from "#test/support";

test("begins authorization with the callback, state and S256 challenge", ({ orm }) => {
  const imports = importUseCases(orm, {
    slackAuthorization: {
      authorizeUrl: ({ returnTo, state, codeChallenge }) => {
        const url = new URL("https://example.com/slack/authorize");
        url.search = new URLSearchParams({
          return_to: returnTo,
          state,
          code_challenge: codeChallenge,
        }).toString();
        return url;
      },
    },
  });
  const returnTo = "https://example.com/api/integrations/slack/callback";

  const { authorizeUrl, state, codeVerifier } = imports.beginSlackConnection(OWNER, returnTo);

  expect(state).not.toBe("");
  expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
  expect(authorizeUrl.searchParams.get("return_to")).toBe(returnTo);
  expect(authorizeUrl.searchParams.get("state")).toBe(state);
  expect(authorizeUrl.searchParams.get("code_challenge")).toBe(
    createHash("sha256").update(codeVerifier).digest("base64url"),
  );
});

test("refuses to begin a connection without Slack authorization", ({ orm }) => {
  const imports = importUseCases(orm, { slackAuthorization: null });

  expect(() =>
    imports.beginSlackConnection(OWNER, "https://example.com/api/integrations/slack/callback"),
  ).toThrow(
    expect.objectContaining({
      code: "UNAVAILABLE",
      message: "Slack is not set up on this server.",
    }),
  );
});
