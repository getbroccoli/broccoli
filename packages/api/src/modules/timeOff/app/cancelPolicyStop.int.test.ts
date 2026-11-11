import {
  expect,
  OWNER,
  giveTermsPolicies,
  readTermsPolicies,
  test,
  timeOffPolicyService,
} from "#test/support";
import { timeOffPolicyRepository } from "../db";
import type { TimeOffRulesInput } from "../domain";
import type { TimeOffPolicyService } from "./timeOffPolicyService";

test("cancelling a planned stop makes the last assignment open-ended again", async ({
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
  const stopped = await service.stopPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    stopDate: "2027-01-01",
  });

  await service.cancelPolicyStop(OWNER, { assignmentId: stopped.id });

  expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toMatchObject(
    [{ id: stopped.id, versionId: policy!.versionId, startDate: "2026-01-01", endDate: null }],
  );
});

test("cancelling a planned stop keeps December's rules open-ended and the previous assignment unchanged", async ({
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
  const december = await publishRules(service, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    startDate: "2026-12-01",
    rules: { balance: "no_balance" },
  });
  const stopped = await service.stopPolicy(OWNER, {
    termsId,
    timeOffTypeId: policy!.timeOffTypeId,
    stopDate: "2027-01-01",
  });
  const [previous] = await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] });

  await service.cancelPolicyStop(OWNER, { assignmentId: stopped.id });

  expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toEqual([
    previous,
    { ...stopped, versionId: december.id, startDate: "2026-12-01", endDate: null },
  ]);
});

test("an open-ended assignment has no planned stop to cancel and stays unchanged", async ({
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
  const before = await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] });
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  await expect(
    service.cancelPolicyStop(OWNER, { assignmentId: before[0]!.id }),
  ).rejects.toMatchObject({ code: "CONFLICT", message: "This type has no planned stop." });

  expect(await timeOffPolicyRepository(orm).findAssignments({ termsIds: [termsId] })).toEqual(
    before,
  );
});

async function publishRules(
  service: TimeOffPolicyService,
  input: { termsId: string; timeOffTypeId: string; startDate: string; rules: TimeOffRulesInput },
) {
  const { termsId, timeOffTypeId, startDate, rules } = input;
  const draft = await service.saveTimeOffPolicy(OWNER, { termsId, timeOffTypeId, rules });
  await service.publishTerms(OWNER, {
    termsId,
    versions: [draft],
    startDate,
    owners: [{ termsId }],
  });
  return draft;
}
