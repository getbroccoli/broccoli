import {
  ADMIN,
  allowanceService,
  expect,
  OWNER,
  readAllowances,
  seedAnnualLeaveAllowance,
  signedIn,
  test,
  type TestSeed,
} from "#test/support";

import type { Orm, Transact } from "../../../core/db";

test("gives the deducted days back and returns the restored allowance figures", async ({
  orm,
  seed,
  transact,
}) => {
  const { allowanceId, adjustmentId, employeeId } = await deductedDays(orm, seed, transact);

  const card = await allowanceService(orm, { today: "2026-11-27" }).reverseAdjustment(OWNER, {
    adjustmentId,
  });

  expect(card).toMatchObject({
    allowanceId,
    entitlement: 28,
    bankHolidays: 8,
    used: 0,
    remaining: 20,
  });
  const [allowance] = await readAllowances(orm, employeeId);
  expect(allowance!.lines.at(-1)).toMatchObject({
    effectiveDate: "2026-11-27",
    kind: "manual_adjustment",
    amount: 2,
    causeKind: "allowance_adjustment_reversed",
    causeRef: adjustmentId,
  });
});

test("shows the reversal with its author and trimmed reason and marks the adjustment reversed", async ({
  orm,
  seed,
  transact,
}) => {
  const { service, allowanceId, adjustmentId } = await deductedDays(orm, seed, transact);

  await service.reverseAdjustment(ADMIN, { adjustmentId, comment: "  Entered twice \n" });

  const history = await service.readAllowanceHistory(OWNER, { allowanceIds: [allowanceId] });
  const changes = history.get(allowanceId)!;
  expect(changes).toMatchObject([
    {
      cause: "allowance_adjustment_reversed",
      amount: 2,
      comment: "Entered twice",
      author: { kind: "SIGNED_IN_USER", id: "test-admin" },
      adjustmentId: expect.any(String) as unknown,
      reversed: false,
    },
    { cause: "allowance_adjusted", adjustmentId, reversed: true },
    { cause: "time_off_turned_on" },
  ]);
  expect(changes[0]!.adjustmentId).not.toBe(adjustmentId);
});

test.for([
  { kind: "omitted", input: {} },
  { kind: "blank", input: { comment: "  \t " } },
])(
  "records a null reason when the reversal comment is $kind",
  async ({ input }, { orm, seed, transact }) => {
    const { service, allowanceId, adjustmentId } = await deductedDays(orm, seed, transact);

    await service.reverseAdjustment(OWNER, { adjustmentId, ...input });

    const history = await service.readAllowanceHistory(OWNER, { allowanceIds: [allowanceId] });
    expect(history.get(allowanceId)?.[0]).toMatchObject({
      cause: "allowance_adjustment_reversed",
      comment: null,
    });
  },
);

test("refuses an employee reversing an adjustment to their own balance", async ({
  orm,
  seed,
  transact,
}) => {
  const { service, employeeId, adjustmentId } = await deductedDays(orm, seed, transact);
  const employee = signedIn(orm, { employeeId, profiles: ["EMPLOYEE"] });

  await expect(service.reverseAdjustment(employee, { adjustmentId })).rejects.toMatchObject({
    name: "ApplicationError",
    code: "FORBIDDEN",
  });
});

test.for([
  { kind: "unknown", adjustmentId: "00000000-0000-4000-8000-000000000001" },
  { kind: "malformed", adjustmentId: "invalid-id" },
])("reports a $kind adjustment id as not found", async ({ adjustmentId }, { orm }) => {
  await expect(
    allowanceService(orm).reverseAdjustment(OWNER, { adjustmentId }),
  ).rejects.toMatchObject({
    name: "ApplicationError",
    code: "NOT_FOUND",
    message: "No adjustment has this id.",
  });
});

test("refuses to reverse a reversal", async ({ orm, seed, transact }) => {
  const { service, allowanceId, adjustmentId } = await deductedDays(orm, seed, transact);
  await service.reverseAdjustment(OWNER, { adjustmentId });
  const history = await service.readAllowanceHistory(OWNER, { allowanceIds: [allowanceId] });
  const reversalId = history.get(allowanceId)![0]!.adjustmentId!;
  expect(reversalId).toEqual(expect.any(String));

  await expect(
    service.reverseAdjustment(OWNER, { adjustmentId: reversalId }),
  ).rejects.toMatchObject({
    name: "ApplicationError",
    code: "NOT_FOUND",
    message: "No adjustment has this id.",
  });
});

test("refuses a second reversal and leaves the balance history unchanged", async ({
  orm,
  seed,
  transact,
}) => {
  const { service, allowanceId, adjustmentId } = await deductedDays(orm, seed, transact);
  await service.reverseAdjustment(OWNER, { adjustmentId });
  const before = await service.readAllowanceHistory(OWNER, { allowanceIds: [allowanceId] });

  await expect(service.reverseAdjustment(OWNER, { adjustmentId })).rejects.toMatchObject({
    name: "ApplicationError",
    code: "CONFLICT",
    message: "This adjustment has been reversed already.",
  });
  expect(await service.readAllowanceHistory(OWNER, { allowanceIds: [allowanceId] })).toEqual(
    before,
  );
});

test("refuses a reversal after the leave year has ended", async ({ orm, seed, transact }) => {
  const { adjustmentId } = await deductedDays(orm, seed, transact);
  const service = allowanceService(orm, { today: "2027-01-01" });

  await expect(service.reverseAdjustment(OWNER, { adjustmentId })).rejects.toMatchObject({
    name: "ApplicationError",
    code: "CONFLICT",
    message: "This leave year has ended.",
  });
});

test("refuses a reversal comment over 1,000 characters after trimming", async ({
  orm,
  seed,
  transact,
}) => {
  const { service, adjustmentId } = await deductedDays(orm, seed, transact);

  await expect(
    service.reverseAdjustment(OWNER, { adjustmentId, comment: "x".repeat(1001) }),
  ).rejects.toMatchObject({
    name: "ApplicationError",
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "comment", code: "too_long" }],
  });
});

async function deductedDays(orm: Orm, seed: TestSeed, transact: Transact) {
  const { employeeId, allowanceId } = await seedAnnualLeaveAllowance(orm, seed, transact);
  const service = allowanceService(orm);
  await service.adjustAllowance(OWNER, {
    allowanceId,
    amount: -2,
    comment: "Leave taken before setup",
  });
  const history = await service.readAllowanceHistory(OWNER, { allowanceIds: [allowanceId] });
  return {
    employeeId,
    allowanceId,
    service,
    adjustmentId: history.get(allowanceId)![0]!.adjustmentId!,
  };
}
