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
  const { env, owner, relay } = await startManagedMailEnv();
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
    blocks: expect.arrayContaining([
      expect.objectContaining({
        type: "button",
        link: expect.stringContaining(`${MANAGED_ASSIGNMENT.publicOrigin}/invite#`) as unknown,
      }),
    ]) as unknown,
    footer: `Sent to ${employee.email}. Not expecting this? Ignore it.`,
    idempotencyKey: expect.stringMatching(/\S+/) as unknown,
  });
  const inviteLink = new URL(invite.body.blocks.find((block) => block.type === "button")!.link);
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
      blocks: expect.arrayContaining([
        expect.objectContaining({
          type: "button",
          link: expect.stringContaining(
            `${MANAGED_ASSIGNMENT.publicOrigin}/reset-password#`,
          ) as unknown,
        }),
      ]) as unknown,
    },
  });
});

test("a managed invite reaches the relay when the inviter's name has quotes and the names are long", async () => {
  const { env, owner, relay } = await startManagedMailEnv();
  const inviterName = 'Alex "AJ" <Reed>\r\n'.padEnd(990, "x");
  const companyName = `Acme ${"C".repeat(95)}`;
  await env.changeUserName(TEST_OWNER.email, inviterName);
  const renamed = await owner.graphql(
    `mutation RenameCompany($input: CompanyInput!) {
      company { update(input: $input) { company { id } error { __typename } } }
    }`,
    { input: { name: companyName } },
  );
  expect(await renamed.json()).toMatchObject({ data: { company: { update: { error: null } } } });
  const employee = await env.seed.employee();

  const invited = await owner.graphql(INVITE_EMPLOYEES, {
    input: { employeeIds: [employee.id] },
  });

  expect(await invited.json()).toMatchObject({
    data: { employee: { invite: { error: null, invites: [{ delivery: "SENT_BY_EMAIL" }] } } },
  });
  await expect.poll(() => relay.emails.length, { timeout: 15_000 }).toBe(1);
  const { body } = relay.emails[0]!;
  expect(body.to).toBe(employee.email);
  expect(body.fromName).not.toMatch(/["<>\r\n]/);
  expect(body.fromName).toContain("Alex AJ Reed");
  expect(body.fromName).toHaveLength(100);
  expect(body.subject).not.toMatch(/[\r\n]/);
  expect(body.subject).toHaveLength(200);
  expect(body.blocks.find((block) => block.type === "heading")!.text).toContain(inviterName);
  expect(body.blocks).toContainEqual({ type: "company", name: companyName });
  for (const block of body.blocks) {
    for (const [field, value] of Object.entries(block)) {
      if (field !== "type" && field !== "link" && typeof value === "string") {
        expect(value.length).toBeLessThanOrEqual(1_000);
      }
    }
  }
  expect(body.footer.length).toBeLessThanOrEqual(1_000);
});

test("an unreadable relay answer is retried, not taken as sent", async () => {
  const { env, owner, relay } = await startManagedMailEnv();
  const employee = await env.seed.employee();
  relay.answerNext(200, "<html>ok</html>");

  const invited = await owner.graphql(INVITE_EMPLOYEES, {
    input: { employeeIds: [employee.id] },
  });

  expect(await invited.json()).toMatchObject({
    data: { employee: { invite: { error: null, invites: [{ delivery: "SENT_BY_EMAIL" }] } } },
  });
  await expect.poll(() => relay.emails.length, { timeout: 20_000 }).toBe(2);
  expect(relay.emails[0]!.body.to).toBe(employee.email);
  expect(relay.emails[1]!.body.idempotencyKey).toBe(relay.emails[0]!.body.idempotencyKey);
  const status = await owner.graphql(
    `query InviteStatus($id: ID!) {
      employee(id: $id) { id signInStatus { state notSent } }
    }`,
    { id: employee.id },
  );
  expect(await status.json()).toEqual({
    data: { employee: { id: employee.id, signInStatus: { state: "PENDING", notSent: false } } },
  });
});

async function startManagedMailEnv() {
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
  return { env, owner, relay };
}
