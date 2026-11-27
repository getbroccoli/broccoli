import { eq } from "drizzle-orm";

import {
  allowanceService,
  bookTimeOffService,
  expect,
  giveDefaultTermsStatutoryMinimum,
  OWNER,
  readAllowances,
  seedAnnualLeaveAllowance,
  seedMixedCountsEmployee,
  seedOwnWeek,
  seedWorkingPattern,
  signedIn,
  SYSTEM,
  test,
  timeOffService,
} from "#test/support";

import { allowances } from "../db";

test("adds an owner's carry-over to entitlement, remaining and history", async ({
  orm,
  seed,
  transact,
}) => {
  const { allowanceId } = await seedAnnualLeaveAllowance(orm, seed, transact);
  const service = allowanceService(orm);
  const comment = "Carried over from 2025";

  const card = await service.adjustAllowance(OWNER, { allowanceId, amount: 2, comment });

  expect(card).toMatchObject({
    allowanceId,
    entitlement: 30,
    bankHolidays: 8,
    used: 0,
    remaining: 22,
  });
  const history = await service.readAllowanceHistory(OWNER, { allowanceIds: [allowanceId] });
  expect(history.get(allowanceId)).toMatchObject([
    {
      cause: "allowance_adjusted",
      amount: 2,
      balanceAfter: 22,
      comment,
      author: { kind: "SIGNED_IN_USER", id: "test-owner" },
      entitlementAfter: 30,
      bankHolidaysAfter: 8,
      usedAfter: 0,
    },
    { cause: "time_off_turned_on", balanceAfter: 20 },
  ]);
});

test("applies an adjustment once when the same request is retried", async ({
  orm,
  seed,
  transact,
}) => {
  const { allowanceId } = await seedAnnualLeaveAllowance(orm, seed, transact);
  const service = allowanceService(orm);
  const input = { allowanceId, requestId: carryOverRequestId, amount: 2, comment: "Carry-over" };
  const first = await service.adjustAllowance(OWNER, input);

  const retry = await service.adjustAllowance(OWNER, input);

  expect(first.remaining).toBe(22);
  expect(retry).toEqual(first);
  const history = await service.readAllowanceHistory(OWNER, { allowanceIds: [allowanceId] });
  expect(history.get(allowanceId)).toMatchObject([
    { cause: "allowance_adjusted", amount: 2, balanceAfter: 22 },
    { cause: "time_off_turned_on", balanceAfter: 20 },
  ]);
});

test.for([
  { changed: "amount", amount: 3, comment: "Carry-over" },
  { changed: "comment", amount: 2, comment: "Correction" },
])(
  "refuses a reused request id with a different $changed",
  async ({ amount, comment }, { orm, seed, transact }) => {
    const { allowanceId } = await seedAnnualLeaveAllowance(orm, seed, transact);
    const service = allowanceService(orm);
    const input = { allowanceId, requestId: carryOverRequestId, amount: 2, comment: "Carry-over" };
    await service.adjustAllowance(OWNER, input);

    await expect(
      service.adjustAllowance(OWNER, { ...input, amount, comment }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "requestId", code: "taken" }],
    });
    const history = await service.readAllowanceHistory(OWNER, { allowanceIds: [allowanceId] });
    expect(history.get(allowanceId)).toMatchObject([
      { cause: "allowance_adjusted", amount: 2, comment: "Carry-over", balanceAfter: 22 },
      { cause: "time_off_turned_on", balanceAfter: 20 },
    ]);
  },
);

test.for(["invalid-id", ""])(
  "refuses a malformed adjustment request id %j",
  async (requestId, { orm, seed, transact }) => {
    const { allowanceId } = await seedAnnualLeaveAllowance(orm, seed, transact);
    const input = { allowanceId, requestId, amount: 2, comment: "Carry-over" };

    await expect(allowanceService(orm).adjustAllowance(OWNER, input)).rejects.toMatchObject({
      name: "ApplicationError",
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "requestId", code: "invalid" }],
    });
  },
);

test("stores the trimmed adjustment comment", async ({ orm, seed, transact }) => {
  const { allowanceId } = await seedAnnualLeaveAllowance(orm, seed, transact);
  const service = allowanceService(orm);

  await service.adjustAllowance(OWNER, {
    allowanceId,
    amount: 1,
    comment: "  Leave taken before setup \n",
  });

  const history = await service.readAllowanceHistory(OWNER, { allowanceIds: [allowanceId] });
  expect(history.get(allowanceId)![0]!.comment).toBe("Leave taken before setup");
});

test("allows a negative adjustment to take remaining below zero", async ({
  orm,
  seed,
  transact,
}) => {
  const { allowanceId } = await seedAnnualLeaveAllowance(orm, seed, transact);

  const card = await allowanceService(orm).adjustAllowance(OWNER, {
    allowanceId,
    amount: -21.25,
    comment: "Leave taken before setup",
  });

  expect(card.remaining).toBe(-1.25);
});

test("keeps the adjustment through a daily check and a working week change", async ({
  orm,
  seed,
  transact,
}) => {
  const { employeeId, allowanceId } = await seedAnnualLeaveAllowance(orm, seed, transact);
  const service = allowanceService(orm);
  const engine = timeOffService(orm, { today: "2026-11-26" });
  await service.adjustAllowance(OWNER, { allowanceId, amount: 2, comment: "Carry-over" });
  const before = await service.readAllowanceHistory(OWNER, { allowanceIds: [allowanceId] });

  await transact((tx) =>
    engine.ensureAllowances(SYSTEM, tx, {
      employeeIds: [employeeId],
      cause: { kind: "DAILY_CHECK", ref: "2026-11-26" },
    }),
  );
  const pattern = await seedWorkingPattern(orm, { minutes: [0, 450, 450, 450, 0, 0, 0] });
  await seedOwnWeek(orm, { employeeId, versionId: pattern.versionId, startDate: "2026-09-01" });
  await transact((tx) =>
    engine.ensureAllowances(SYSTEM, tx, {
      employeeIds: [employeeId],
      cause: { kind: "WORKING_PATTERN_CHANGED", ref: "2026-09-01" },
    }),
  );

  const cards = await engine.readTimeOffTypes(OWNER, { employeeIds: [employeeId] });
  expect(cards.get(employeeId)).toMatchObject([{ remaining: 20.5 }]);
  const after = await service.readAllowanceHistory(OWNER, { allowanceIds: [allowanceId] });
  expect(after.get(allowanceId)).toEqual([
    expect.objectContaining({
      cause: "working_pattern_changed",
      amount: -1.5,
      balanceAfter: 20.5,
    }) as unknown,
    ...before.get(allowanceId)!,
  ]);
});

test("lets an admin adjust their own balance", async ({ orm, seed, transact }) => {
  const { employeeId, allowanceId } = await seedAnnualLeaveAllowance(orm, seed, transact);
  const self = signedIn(orm, { employeeId, profiles: ["ADMIN"] });

  const card = await allowanceService(orm).adjustAllowance(self, {
    allowanceId,
    amount: 1,
    comment: "Carry-over",
  });

  expect(card.remaining).toBe(21);
});

test.for([
  { starter: "current", startDate: "2025-01-01", effectiveDate: "2026-11-26" },
  { starter: "future", startDate: "2027-02-01", effectiveDate: "2027-01-01" },
])(
  "dates a $starter starter's adjustment within the displayed leave year",
  async ({ startDate, effectiveDate }, { orm, seed, transact }) => {
    const employee = await seed.employee({ startDate });
    await giveDefaultTermsStatutoryMinimum(orm, seed, transact);
    const cards = await timeOffService(orm).readTimeOffTypes(OWNER, { employeeIds: [employee.id] });
    const allowanceId = cards.get(employee.id)![0]!.allowanceId!;

    await allowanceService(orm).adjustAllowance(OWNER, {
      allowanceId,
      amount: 1,
      comment: "Carry-over",
    });

    const [allowance] = await readAllowances(orm, employee.id);
    expect(allowance!.lines.filter(({ kind }) => kind === "manual_adjustment")).toMatchObject([
      { effectiveDate },
    ]);
  },
);

test.for([
  { reason: "unknown", allowanceId: "00000000-0000-4000-8000-000000000001" },
  { reason: "malformed", allowanceId: "invalid-id" },
])("reports a $reason allowance id as not found", async ({ allowanceId }, { orm }) => {
  await expect(
    allowanceService(orm).adjustAllowance(OWNER, { allowanceId, amount: 1, comment: "Carry-over" }),
  ).rejects.toMatchObject({ name: "ApplicationError", code: "NOT_FOUND" });
});

test.for(["employee", "manager"] as const)(
  "forbids an adjustment by the %s",
  async (role, { orm, seed, transact }) => {
    const { allowanceId, employeeId } = await seedAnnualLeaveAllowance(orm, seed, transact);
    const manager = await seed.employee();
    await seed.manager(employeeId, manager.id);
    const caller = signedIn(orm, {
      employeeId: role === "manager" ? manager.id : employeeId,
      profiles: ["EMPLOYEE"],
    });

    await expect(
      allowanceService(orm).adjustAllowance(caller, {
        allowanceId,
        amount: 2,
        comment: "Carry-over",
      }),
    ).rejects.toMatchObject({ name: "ApplicationError", code: "FORBIDDEN" });
  },
);

test.for([
  { reason: "zero", amount: 0, code: "invalid" },
  { reason: "three decimals", amount: 1.234, code: "invalid" },
  { reason: "more than 366", amount: 366.01, code: "out_of_range" },
  { reason: "less than minus 366", amount: -366.01, code: "out_of_range" },
])("refuses an adjustment amount of $reason", async ({ amount, code }, { orm, seed, transact }) => {
  const { allowanceId } = await seedAnnualLeaveAllowance(orm, seed, transact);

  await expect(
    allowanceService(orm).adjustAllowance(OWNER, { allowanceId, amount, comment: "Carry-over" }),
  ).rejects.toMatchObject({
    name: "ApplicationError",
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "amount", code }],
  });
});

test.for([
  { reason: "blank", comment: " \t\n ", code: "required" },
  { reason: "longer than 1,000 characters", comment: "x".repeat(1001), code: "too_long" },
])("refuses a comment that is $reason", async ({ comment, code }, { orm, seed, transact }) => {
  const { allowanceId } = await seedAnnualLeaveAllowance(orm, seed, transact);

  await expect(
    allowanceService(orm).adjustAllowance(OWNER, { allowanceId, amount: 2, comment }),
  ).rejects.toMatchObject({
    name: "ApplicationError",
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "comment", code }],
  });
});

test("refuses an adjustment after the leave year has ended", async ({ orm, seed, transact }) => {
  const { allowanceId } = await seedAnnualLeaveAllowance(orm, seed, transact);
  const service = allowanceService(orm, { today: "2027-01-04" });

  await expect(
    service.adjustAllowance(OWNER, { allowanceId, amount: 2, comment: "Carry-over" }),
  ).rejects.toMatchObject({ name: "ApplicationError", code: "CONFLICT" });
});

test("refuses an allowance whose current card is unlimited", async ({ orm, seed, transact }) => {
  const { employeeId } = await seedMixedCountsEmployee(orm, seed, transact);
  const [allowance] = await orm
    .select()
    .from(allowances)
    .where(eq(allowances.employeeId, employeeId));

  await expect(
    allowanceService(orm).adjustAllowance(OWNER, {
      allowanceId: allowance!.id,
      amount: 2,
      comment: "Carry-over",
    }),
  ).rejects.toMatchObject({
    name: "ApplicationError",
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "allowanceId", code: "invalid" }],
  });
});

test("refuses next year's allowance while the card still shows this year", async ({
  orm,
  seed,
  transact,
}) => {
  const { employeeId, timeOffTypeId } = await seedAnnualLeaveAllowance(orm, seed, transact);
  await bookTimeOffService(orm).bookTimeOff(OWNER, {
    employeeId,
    timeOffTypeId,
    startDate: "2027-01-04",
    endDate: "2027-01-04",
  });
  const cards = await timeOffService(orm, { today: "2027-01-04" }).readTimeOffTypes(OWNER, {
    employeeIds: [employeeId],
  });
  const allowanceId = cards.get(employeeId)![0]!.allowanceId!;

  await expect(
    allowanceService(orm).adjustAllowance(OWNER, { allowanceId, amount: 2, comment: "Carry-over" }),
  ).rejects.toMatchObject({
    name: "ApplicationError",
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "allowanceId", code: "invalid" }],
  });
});

const carryOverRequestId = "00000000-0000-4000-8000-000000000001";
