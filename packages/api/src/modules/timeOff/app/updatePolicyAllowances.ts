import type { Tx } from "../../../core/db";
import { timeOffPolicyRepository } from "../db";
import { type AllowanceEngineDependencies, ensureAllowancesOf } from "./allowanceEngine";
import type { PolicyEdit } from "./planTimeOffTypeUpdate";
import type { TimeOffTypeSettingsDependencies } from "./timeOffTypeSettings";

type Dependencies = TimeOffTypeSettingsDependencies & { engine: AllowanceEngineDependencies };

/** Runs the engine for everyone ever on the policy, when its grant changed. */
export async function updateAllowances(
  dependencies: Dependencies,
  tx: Tx,
  { policy, grantChanged }: PolicyEdit,
  employeeIds: readonly string[],
): Promise<void> {
  if (grantChanged) {
    await ensureAllowancesOf(dependencies.engine, tx, {
      employeeIds,
      cause: { kind: "POLICY_CHANGED", ref: policy.id },
    });
  }
}

/**
 * Who each policy whose grant changes reaches, all of them locked at once in id order, as the
 * daily job locks them, so the per-policy runs never take locks in an order that deadlocks.
 */
export async function lockReach(
  dependencies: Dependencies,
  tx: Tx,
  edits: readonly PolicyEdit[],
): Promise<Map<string, string[]>> {
  const changed = edits.filter(({ grantChanged }) => grantChanged).map(({ policy }) => policy.id);
  const reach = await reachOfPolicies(dependencies, tx, changed);
  await dependencies.engine.employeeReads.lockEmployees(tx, [
    ...new Set([...reach.values()].flat()),
  ]);
  return reach;
}

/** Everyone ever on each policy: on any terms ever linked to it, or ever assigned it. */
async function reachOfPolicies(
  { employeeReads }: TimeOffTypeSettingsDependencies,
  tx: Tx,
  policyIds: readonly string[],
): Promise<Map<string, string[]>> {
  const repository = timeOffPolicyRepository(tx);
  const [links, assignments] = await Promise.all([
    repository.findLinksOfPolicies(policyIds),
    repository.findAssignmentsOfPolicies(policyIds),
  ]);
  const terms = await employeeReads.readTerms(tx, [
    ...new Set(links.map(({ termsId }) => termsId)),
  ]);
  const membersOf = new Map(terms.map(({ id, memberIds }) => [id, memberIds]));
  return new Map(
    policyIds.map((policyId) => [
      policyId,
      [
        ...new Set([
          ...links
            .filter(({ timeOffPolicyId }) => timeOffPolicyId === policyId)
            .flatMap(({ termsId }) => membersOf.get(termsId) ?? []),
          ...assignments
            .filter(({ timeOffPolicyId }) => timeOffPolicyId === policyId)
            .map(({ employeeId }) => employeeId),
        ]),
      ],
    ]),
  );
}
