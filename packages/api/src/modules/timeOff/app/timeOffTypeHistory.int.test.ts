import {
  ADMIN,
  EMPLOYEE,
  expect,
  seedTimeOffPolicy,
  seedTimeOffType,
  test,
  timeOffService,
} from "#test/support";

import { createRecordHistoryReaderService } from "../../../core/records";
import { timeOffTypeRecordType } from "./timeOffTypeRecordType";

test("an admin reads a type's history newest first, with policy lines", async ({ orm }) => {
  const policy = await seedTimeOffPolicy(orm, {
    name: "Wellbeing",
    balance: "balance_from_allowance",
    entitlementDays: 20,
  });
  const service = timeOffService(orm, { today: "2026-11-05" });
  await service.saveTimeOffType(ADMIN, { id: policy.timeOffTypeId, name: "Company leave" });
  await service.saveTimeOffType(ADMIN, {
    id: policy.timeOffTypeId,
    policies: [{ id: policy.id, name: "More wellbeing", allowanceDays: 22 }],
  });
  const history = createRecordHistoryReaderService(orm, {
    time_off_type: timeOffTypeRecordType(orm),
  });

  const { edges } = await history.readHistory(ADMIN, "time_off_type", policy.timeOffTypeId, {});

  expect(edges).toHaveLength(2);
  expect(edges[0]!.node).toMatchObject({
    recordType: "time_off_type",
    recordId: policy.timeOffTypeId,
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
  });
  expect(edges[0]!.node.changes).toEqual(
    expect.arrayContaining([
      {
        field: "policy",
        oldValue: policy.id,
        newValue: policy.id,
        oldLabel: "Wellbeing",
        newLabel: "More wellbeing",
      },
      { field: "policyName", oldValue: "Wellbeing", newValue: "More wellbeing" },
      { field: "allowanceDays", oldValue: "20", newValue: "22" },
    ]),
  );
  expect(edges[1]!.node.changes).toEqual([
    { field: "name", oldValue: "Wellbeing", newValue: "Company leave" },
  ]);
  expect(BigInt(edges[0]!.node.id)).toBeGreaterThan(BigInt(edges[1]!.node.id));
});

test("someone without MANAGE_WORKSPACE cannot read a type's history", async ({ orm }) => {
  const type = await seedTimeOffType(orm, "Wellbeing");
  await timeOffService(orm).saveTimeOffType(ADMIN, { id: type.id, name: "Company leave" });
  const history = createRecordHistoryReaderService(orm, {
    time_off_type: timeOffTypeRecordType(orm),
  });

  await expect(history.readHistory(EMPLOYEE, "time_off_type", type.id, {})).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
