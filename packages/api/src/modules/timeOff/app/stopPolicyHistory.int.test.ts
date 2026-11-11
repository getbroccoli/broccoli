import {
  termsService,
  expect,
  OWNER,
  giveTermsPolicies,
  readTermsPolicies,
  test,
  timeOffPolicyService,
} from "#test/support";
import { timeOffPolicyRepository } from "../db";

test("publishing a stop writes one terms history line with the old rules and stop date", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ recordOnly: "family_leave" }],
    today: "2026-11-06",
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  const history = termsService(orm, { today: "2026-11-06" });

  const draft = await service.saveTimeOffStop(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
  });
  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft],
    startDate: "2027-01-01",
    owners: [{ termsId }],
  });

  const page = await history.readTermsHistory(OWNER, termsId, {});
  expect(page.edges).toHaveLength(1);
  const line = page.edges[0]!.node;
  expect(line).toMatchObject({
    recordType: "terms",
    recordId: termsId,
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
  });
  expect(line.changes).toHaveLength(1);
  expect(line.changes[0]).toMatchObject({
    field: `timeOff.${policy!.timeOffTypeId}`,
    newLabel: "Family leave",
    newValue: JSON.stringify({ stopDate: "2027-01-01" }),
  });
  expect(JSON.parse(line.changes[0]!.oldValue!)).toEqual({
    startDate: "2026-01-01",
    balance: "no_balance",
    entitlementDays: null,
    bankHolidays: null,
  });
});

test("cancelling a planned stop writes one terms history line with the cancelled stop date", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ recordOnly: "family_leave" }],
    today: "2026-11-06",
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  const history = termsService(orm, { today: "2026-11-06" });
  const draft = await service.saveTimeOffStop(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
  });
  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft],
    startDate: "2027-01-01",
    owners: [{ termsId }],
  });
  const stopped = (await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).at(
    -1,
  )!;
  const before = await history.readTermsHistory(OWNER, termsId, {});

  await service.cancelPolicyStop(OWNER, {
    assignmentId: stopped.id,
  });

  const page = await history.readTermsHistory(OWNER, termsId, {});
  const added = page.edges.filter(
    ({ node }) => !before.edges.some((edge) => edge.node.id === node.id),
  );
  expect(added).toHaveLength(1);
  const line = added[0]!.node;
  expect(line).toMatchObject({
    recordType: "terms",
    recordId: termsId,
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
  });
  expect(line.changes).toHaveLength(1);
  expect(line.changes[0]).toMatchObject({
    field: `timeOff.${policy!.timeOffTypeId}`,
    newLabel: "Family leave",
    oldValue: JSON.stringify({ stopDate: "2027-01-01" }),
    newValue: null,
  });
});
