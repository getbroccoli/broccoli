import { employeeInviteService, employeeUseCases, expect, test } from "#test/support";

test("cancels a pending invite and records the sign-in change", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const employee = await seed.employee();
  const service = employeeInviteService(orm);
  await service.send(owner, { employeeIds: [employee.id] }, "https://copy.example.com");

  expect(await service.cancel(owner, { employeeId: employee.id })).toEqual(employee);

  expect((await service.readStatuses(owner, [employee.id])).get(employee.id)).toEqual({
    state: "not_invited",
    expiresAt: null,
    notSent: false,
    emailHasAccount: false,
    canBeInvited: true,
  });
  const { edges } = await employeeUseCases(orm).readEmployeeHistory(owner, employee.id, {});
  expect(edges).toHaveLength(2);
  expect(edges[0]!.node).toMatchObject({
    cause: { kind: "INVITE_CANCELLED" },
    changes: [{ field: "signIn", oldValue: "INVITED", newValue: "NOT_INVITED" }],
  });
});

test("refuses cancellation without an open invite", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const employee = await seed.employee();

  await expect(
    employeeInviteService(orm).cancel(owner, { employeeId: employee.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
