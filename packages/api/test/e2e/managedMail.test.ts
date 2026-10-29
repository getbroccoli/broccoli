import { onTestFinished } from "vitest";
import {
  approveReviewedImport,
  createBrowser,
  expect,
  INVITE_EMPLOYEES,
  MANAGED_ASSIGNMENT,
  MANAGED_INSTANCE_CREDENTIAL,
  signInAsManagedOwner,
  startFakeMailRelay,
  startManagedEnv,
  test,
  TEST_OWNER,
} from "#test/support";

test("a managed person receives an invite and a password reset through Broccoli's relay", async () => {
  const relay = await startFakeMailRelay();
  onTestFinished(() => relay.stop());
  const { env, accounts } = await startManagedEnv({ mailRelayUrl: relay.url });
  const owner = await signInAsManagedOwner(env, accounts);
  expect(
    await (
      await owner.graphql(
        `mutation { company { update(input: { name: "Acme Corp" }) { error { __typename } } } }`,
      )
    ).json(),
  ).toMatchObject({ data: { company: { update: { error: null } } } });
  expect(await (await approveReviewedImport(owner)).json()).toMatchObject({
    data: { import: { approve: { error: null } } },
  });
  expect(
    await (await owner.graphql("mutation { setup { complete { setup { step } } } }")).json(),
  ).toMatchObject({ data: { setup: { complete: { setup: { step: "DONE" } } } } });
  const employee = await env.seed.employee({ firstName: "Robin", email: "robin@example.com" });
  const browser = createBrowser(env.url, MANAGED_ASSIGNMENT.publicOrigin);
  expect(
    await (await owner.graphql("query { setup { inviteDelivery passwordResetByEmail } }")).json(),
  ).toEqual({
    data: { setup: { inviteDelivery: "SENT_BY_EMAIL", passwordResetByEmail: true } },
  });

  const invited = await owner.graphql(INVITE_EMPLOYEES, {
    input: { employeeIds: [employee.id] },
  });

  expect(await invited.json()).toMatchObject({
    data: {
      employee: {
        invite: {
          error: null,
          invites: [{ employee: { id: employee.id }, delivery: "SENT_BY_EMAIL", link: null }],
        },
      },
    },
  });
  await expect.poll(() => relay.emails.length, { timeout: 15_000 }).toBe(1);
  const invite = relay.emails[0]!;
  expect(invite.headers.authorization).toBe(`Bearer ${MANAGED_INSTANCE_CREDENTIAL}`);
  expect(invite.body).toEqual({
    to: employee.email,
    fromName: "Avery Stone",
    subject: expect.any(String) as unknown,
    text: expect.stringContaining(`${MANAGED_ASSIGNMENT.publicOrigin}/invite#`) as unknown,
    html: expect.stringContaining(`${MANAGED_ASSIGNMENT.publicOrigin}/invite#`) as unknown,
    idempotencyKey: expect.stringMatching(/\S+/) as unknown,
  });
  const inviteLink = new URL(invite.body.text.match(/https?:\/\/\S+/)![0]);
  expect(
    (
      await browser.post("/api/auth/invite/accept", {
        token: inviteLink.hash.slice(1),
        password: TEST_OWNER.password,
      })
    ).status,
  ).toBe(200);
  expect((await browser.post("/api/auth/sign-out", {})).status).toBe(200);

  const requested = await browser.post("/api/auth/request-password-reset", {
    email: employee.email,
  });

  expect(requested.status).toBe(200);
  await expect.poll(() => relay.emails.length, { timeout: 15_000 }).toBe(2);
  expect(relay.emails[1]).toMatchObject({
    headers: { authorization: `Bearer ${MANAGED_INSTANCE_CREDENTIAL}` },
    body: {
      to: employee.email,
      fromName: "Broccoli",
      html: expect.stringContaining(
        `${MANAGED_ASSIGNMENT.publicOrigin}/reset-password#`,
      ) as unknown,
    },
  });
});
