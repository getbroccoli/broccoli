import {
  expect,
  giveTermsPolicies,
  OWNER,
  readTermsPolicies,
  termsService,
  test,
  timeOffPolicyService,
  workingPatternService,
} from "#test/support";

test("publishing rules records the later policy assignment it cancels", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm);
  const history = termsService(orm);
  const planned = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 22,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });
  await service.publishTerms(OWNER, {
    termsId,
    versions: [planned],
    startDate: "2027-01-01",
    owners: [{ termsId }],
  });
  const draft = await service.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 25,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });
  const before = await history.readTermsHistory(OWNER, termsId, {});

  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft],
    startDate: "2026-07-01",
    owners: [{ termsId }],
  });

  const page = await history.readTermsHistory(OWNER, termsId, {});
  const added = page.edges.filter(
    ({ node }) => !before.edges.some((edge) => edge.node.id === node.id),
  );
  expect(added).toHaveLength(2);
  const changed = added.find(({ node }) => node.changes[0]?.newValue !== null)!.node;
  expect(changed.changes).toHaveLength(1);
  expect(changed.changes[0]!.field).toBe(`timeOff.${policy!.timeOffTypeId}`);
  expect(JSON.parse(changed.changes[0]!.newValue!)).toEqual({
    startDate: "2026-07-01",
    balance: "balance_from_allowance",
    entitlementDays: 25,
    bankHolidays: "bank_holidays_on_top_of_allowance",
  });
  const cancelled = added.find(({ node }) => node.changes[0]?.newValue === null)!.node;
  expect(cancelled).toMatchObject({
    recordType: "terms",
    recordId: termsId,
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
  });
  expect(cancelled.changes).toHaveLength(1);
  expect(cancelled.changes[0]).toMatchObject({
    field: `timeOff.${policy!.timeOffTypeId}`,
    newLabel: "Annual leave",
    newValue: null,
  });
  expect(JSON.parse(cancelled.changes[0]!.oldValue!)).toEqual({
    startDate: "2027-01-01",
    balance: "balance_from_allowance",
    entitlementDays: 22,
    bankHolidays: "bank_holidays_on_top_of_allowance",
  });
});

test("publishing a working week records the later working pattern assignment it cancels", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.defaultTermsId();
  const weeks = workingPatternService(orm);
  const service = timeOffPolicyService(orm);
  const history = termsService(orm);
  const planned = await weeks.saveWorkingPattern(OWNER, {
    termsId,
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "england_and_wales",
  });
  await service.publishTerms(OWNER, {
    termsId,
    versions: [planned],
    startDate: "2027-01-01",
    owners: [{ termsId }],
  });
  const draft = await weeks.saveWorkingPattern(OWNER, {
    termsId,
    minutes: [420, 420, 420, 420, 420, 0, 0],
    bankHolidayCalendar: "scotland",
  });
  const before = await history.readTermsHistory(OWNER, termsId, {});

  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft],
    startDate: "2026-07-01",
    owners: [{ termsId }],
  });

  const page = await history.readTermsHistory(OWNER, termsId, {});
  const added = page.edges.filter(
    ({ node }) => !before.edges.some((edge) => edge.node.id === node.id),
  );
  expect(added).toHaveLength(2);
  const changed = added.find(({ node }) => node.changes[0]?.newValue !== null)!.node;
  expect(changed.changes).toHaveLength(1);
  expect(changed.changes[0]!.field).toBe("workingWeek");
  expect(JSON.parse(changed.changes[0]!.newValue!)).toEqual({
    startDate: "2026-07-01",
    minutes: [420, 420, 420, 420, 420, 0, 0],
    bankHolidayCalendar: "scotland",
  });
  const cancelled = added.find(({ node }) => node.changes[0]?.newValue === null)!.node;
  expect(cancelled).toMatchObject({
    recordType: "terms",
    recordId: termsId,
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
  });
  expect(cancelled.changes).toHaveLength(1);
  expect(cancelled.changes[0]).toMatchObject({ field: "workingWeek", newValue: null });
  expect(JSON.parse(cancelled.changes[0]!.oldValue!)).toEqual({
    startDate: "2027-01-01",
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "england_and_wales",
  });
});
