import { and, isNull, sql } from "drizzle-orm";
import { employeeInviteService, employeeUseCases, expect, test } from "#test/support";

test("returns a private copied link per person when no mail is chosen", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const people = await seed.employees(2);
  const service = employeeInviteService(orm);

  const sent = await service.send(
    owner,
    { employeeIds: people.map(({ id }) => id) },
    "https://copy.example.com",
  );

  expect(sent).toHaveLength(2);
  expect(sent.map(({ employee }) => employee.id).sort()).toEqual(people.map(({ id }) => id).sort());
  for (const invite of sent) {
    expect(invite).toMatchObject({
      delivery: "copied_by_owner",
      expiresAt: expect.any(Date) as unknown,
    });
    expect(invite.link).toMatch(/^https:\/\/copy\.example\.com\/invite#[A-Za-z0-9_-]{43}$/);
  }
  expect(new Set(sent.map(({ link }) => link)).size).toBe(2);
  expect(service.sentJobs).toEqual([]);
});

test("never stores a copied token in plain text", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const employee = await seed.employee();

  const [sent] = await employeeInviteService(orm).send(
    owner,
    { employeeIds: [employee.id] },
    "https://copy.example.com",
  );

  const token = new URL(sent!.link!).hash.slice(1);
  const rows = await orm
    .select({ row: sql<Record<string, unknown>>`to_jsonb(invites)` })
    .from(sql`invites`);
  expect(rows).toHaveLength(1);
  expect(Object.values(rows[0]!.row)).not.toContain(token);
  expect(JSON.stringify(rows)).not.toContain(token);
});

test("returns copied links when the owner chooses them despite configured mail", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  await seed.mailSettings();
  const employee = await seed.employee();
  const service = employeeInviteService(orm);

  const sent = await service.send(
    owner,
    { employeeIds: [employee.id], delivery: "copied_by_owner" },
    "https://copy.example.com",
  );

  expect(sent).toMatchObject([
    {
      delivery: "copied_by_owner",
      link: expect.stringMatching(/^https:\/\/copy\.example\.com\/invite#/) as unknown,
    },
  ]);
  expect(service.sentJobs).toEqual([]);
});

test("replaces the open invite and writes one history line per send", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const employee = await seed.employee();
  const service = employeeInviteService(orm);
  const [first] = await service.send(
    owner,
    { employeeIds: [employee.id] },
    "https://copy.example.com",
  );

  const [second] = await service.send(
    owner,
    { employeeIds: [employee.id] },
    "https://copy.example.com",
  );

  expect(second!.link).not.toBe(first!.link);
  const rows = await orm
    .select({ row: sql<Record<string, unknown>>`to_jsonb(invites)` })
    .from(sql`invites`)
    .where(and(isNull(sql`accepted_at`), isNull(sql`cancelled_at`), isNull(sql`replaced_at`)));
  expect(rows).toHaveLength(1);
  expect(rows[0]!.row).toMatchObject({ employee_id: employee.id });
  const { edges } = await employeeUseCases(orm).readEmployeeHistory(owner, employee.id, {});
  expect(edges).toHaveLength(2);
  expect(edges.map(({ node }) => node)).toMatchObject([
    {
      cause: { kind: "INVITE_SENT" },
      changes: [{ field: "signIn", oldValue: "INVITED", newValue: "INVITED" }],
    },
    {
      cause: { kind: "INVITE_SENT" },
      changes: [{ field: "signIn", oldValue: "NOT_INVITED", newValue: "INVITED" }],
    },
  ]);
});

test("creates one invite for duplicate employee ids", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const employee = await seed.employee();

  const sent = await employeeInviteService(orm).send(
    owner,
    { employeeIds: [employee.id, employee.id] },
    "https://copy.example.com",
  );

  expect(sent).toHaveLength(1);
  expect(
    (await employeeUseCases(orm).readEmployeeHistory(owner, employee.id, {})).edges,
  ).toHaveLength(1);
});

test("skips a person who already joined", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const user = await seed.user({ email: "joined@example.com" });
  const employee = await seed.employee({ userId: user.id });
  const service = employeeInviteService(orm);

  expect(
    await service.send(owner, { employeeIds: [employee.id] }, "https://copy.example.com"),
  ).toEqual([]);

  expect((await service.readStatuses(owner, [employee.id])).get(employee.id)).toMatchObject({
    state: "joined",
  });
  expect(
    await orm.select({ row: sql<Record<string, unknown>>`to_jsonb(invites)` }).from(sql`invites`),
  ).toEqual([]);
});

test("skips a person whose email already belongs to an account", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await seed.user({ email: "existing@example.com" });
  const employee = await seed.employee({ email: "existing@example.com" });
  const service = employeeInviteService(orm);

  expect(
    await service.send(owner, { employeeIds: [employee.id] }, "https://copy.example.com"),
  ).toEqual([]);

  expect((await service.readStatuses(owner, [employee.id])).get(employee.id)).toMatchObject({
    state: "not_invited",
    emailHasAccount: true,
  });
  expect(
    await orm.select({ row: sql<Record<string, unknown>>`to_jsonb(invites)` }).from(sql`invites`),
  ).toEqual([]);
});

test("skips demo employees", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const employee = await seed.employee({ isDemo: true });

  expect(
    await employeeInviteService(orm).send(
      owner,
      { employeeIds: [employee.id] },
      "https://copy.example.com",
    ),
  ).toEqual([]);

  expect(
    await orm.select({ row: sql<Record<string, unknown>>`to_jsonb(invites)` }).from(sql`invites`),
  ).toEqual([]);
});

test.for([
  { reason: "no employee ids", input: { employeeIds: [] } },
  {
    reason: "more than 1,000 employee ids",
    input: {
      employeeIds: Array.from(
        { length: 1001 },
        (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      ),
    },
  },
  { reason: "a note longer than 1,000 characters", input: { note: "a".repeat(1001) } },
  { reason: "the owner profile", input: { profiles: ["OWNER"] as const } },
])("refuses $reason", async ({ input }, { orm, seed }) => {
  const owner = await seed.owner();
  const employee = await seed.employee();

  await expect(
    employeeInviteService(orm).send(
      owner,
      { employeeIds: [employee.id], ...input },
      "https://copy.example.com",
    ),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });

  expect(
    await orm.select({ row: sql<Record<string, unknown>>`to_jsonb(invites)` }).from(sql`invites`),
  ).toEqual([]);
});

test("refuses an unknown employee id", async ({ orm, seed }) => {
  const owner = await seed.owner();

  await expect(
    employeeInviteService(orm).send(
      owner,
      { employeeIds: ["00000000-0000-4000-8000-000000000001"] },
      "https://copy.example.com",
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
