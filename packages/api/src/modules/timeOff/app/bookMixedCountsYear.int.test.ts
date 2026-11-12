import {
  expect,
  seedMixedCountsEmployee,
  OWNER,
  test,
  bookTimeOffService,
  timeOffService,
} from "#test/support";

test("charges only the allowance day when a booking starts on Unlimited rules", async ({
  orm,
  seed,
  transact,
}) => {
  const person = await seedMixedCountsEmployee(orm, seed, transact);
  const service = timeOffService(orm, { today: "2027-07-01" });
  const employeeIds = [person.employeeId];
  await transact((tx) =>
    service.ensureAllowances(OWNER, tx, {
      employeeIds,
      cause: { kind: "DAILY_CHECK", ref: null },
    }),
  );
  const before = await service.readTimeOffTypes(OWNER, { employeeIds });
  expect(before.get(person.employeeId)).toMatchObject([
    { periodStart: "2027-01-01", balance: "balance_from_allowance", used: 0 },
  ]);
  const remainingBefore = before.get(person.employeeId)![0]!.remaining;
  expect(remainingBefore).toBeTypeOf("number");

  await bookTimeOffService(orm, { today: "2026-11-09" }).bookTimeOff(OWNER, {
    ...person,
    startDate: "2027-06-30",
    endDate: "2027-07-01",
  });

  const after = await service.readTimeOffTypes(OWNER, { employeeIds });
  expect(after.get(person.employeeId)).toMatchObject([
    { periodStart: "2027-01-01", used: 1, remaining: remainingBefore! - 1 },
  ]);
});

test("previews allowance figures when a booking starts on Unlimited rules and ends on allowance rules", async ({
  orm,
  seed,
  transact,
}) => {
  const person = await seedMixedCountsEmployee(orm, seed, transact);

  const preview = await bookTimeOffService(orm, { today: "2026-11-09" }).previewBooking(OWNER, {
    ...person,
    startDate: "2027-06-30",
    endDate: "2027-07-01",
  });

  expect(preview.refusal).toBeNull();
  expect(preview.balances).toMatchObject([
    {
      periodStart: "2027-01-01",
      periodEnd: "2027-12-31",
      balance: "balance_from_allowance",
    },
  ]);
  const [balance] = preview.balances;
  expect(balance!.remainingBefore).toBeTypeOf("number");
  expect(balance!.remainingAfter).toBeTypeOf("number");
  expect(balance!.remainingAfter).toBe(balance!.remainingBefore! - 1);
});

test("previews no used days for an Unlimited-only booking in a year with allowance rules", async ({
  orm,
  seed,
  transact,
}) => {
  const person = await seedMixedCountsEmployee(orm, seed, transact);

  const preview = await bookTimeOffService(orm, { today: "2026-11-09" }).previewBooking(OWNER, {
    ...person,
    startDate: "2027-06-30",
    endDate: "2027-06-30",
  });

  expect(preview.refusal).toBeNull();
  expect(preview.balances).toEqual([
    {
      periodStart: "2027-01-01",
      periodEnd: "2027-12-31",
      balance: "unlimited_balance",
      remainingBefore: null,
      remainingAfter: null,
      usedBefore: 0,
      usedAfter: 0,
    },
  ]);
});
