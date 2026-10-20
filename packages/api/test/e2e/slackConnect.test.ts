import { onTestFinished } from "vitest";

import {
  createBrowser,
  expect,
  MANAGED_ASSIGNMENT,
  signInAsManagedOwner,
  slackAuthorization,
  slackTest as test,
  startManagedEnv,
  TEST_OWNER,
  TestEnv,
} from "#test/support";

test("connecting redirects the owner to the relay with an OAuth cookie and callback URL", async ({
  env,
  slack,
}) => {
  const { browser } = await env.signInAsOwner();

  const response = await browser.getManual("/api/integrations/slack/connect");

  expect(response.status).toBe(302);
  const { cookie, authorizeUrl } = slackAuthorization(response);
  expect(cookie).toContain("Path=/api/integrations/slack");
  expect(cookie).toContain("Max-Age=600");
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("SameSite=Lax");
  expect(authorizeUrl.origin).toBe(slack.url);
  expect(authorizeUrl.pathname).toBe("/slack/authorize");
  expect(authorizeUrl.searchParams.get("return_to")).toBe(
    `${env.url}/api/integrations/slack/callback`,
  );
});

test("connecting on a self-hosted instance uses its public URL for the relay callback", async ({
  slack,
}) => {
  const publicUrl = "https://broccoli.example.com";
  const env = await TestEnv.start({
    publicUrl,
    slack: { relayUrl: slack.url, apiUrl: slack.url },
  });
  onTestFinished(() => env.stop());
  await env.seed.owner(TEST_OWNER);
  const browser = createBrowser(env.url, publicUrl);
  expect((await browser.post("/api/auth/sign-in/email", TEST_OWNER)).status).toBe(200);

  const response = await browser.getManual("/api/integrations/slack/connect");

  expect(response.status).toBe(302);
  const { authorizeUrl } = slackAuthorization(response);
  expect(authorizeUrl.origin).toBe(slack.url);
  expect(authorizeUrl.searchParams.get("return_to")).toBe(
    `${publicUrl}/api/integrations/slack/callback`,
  );
});

test("connecting on a managed instance uses its assigned public origin for the relay callback", async ({
  slack,
}) => {
  const { env, accounts } = await startManagedEnv({
    slack: { relayUrl: slack.url, apiUrl: slack.url },
  });
  const browser = await signInAsManagedOwner(env, accounts);

  const response = await browser.getManual("/api/integrations/slack/connect");

  expect(response.status).toBe(302);
  const { authorizeUrl } = slackAuthorization(response);
  expect(authorizeUrl.origin).toBe(slack.url);
  expect(authorizeUrl.searchParams.get("return_to")).toBe(
    `${MANAGED_ASSIGNMENT.publicOrigin}/api/integrations/slack/callback`,
  );
});
