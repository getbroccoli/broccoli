import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Transact, Tx } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import type { SecurityContext } from "../../../core/security";
import { type CalendarDate, parseUuid } from "../../../utils";
import {
  applyAssignmentPlan,
  type AssignmentOwner,
  type Employee,
  type EmployeeReadService,
  isSameOwner,
  parseChangeDate,
  parseDateField,
  type TermsOverview,
  type WorkingPatternPublish,
  type WorkingPatternService,
} from "../../employees";
import type { Orm } from "../../../core/db";
import { timeOffPolicyRepository } from "../db";
import type { EnsuredAllowances } from "./allowanceEngine";
import {
  type PolicyPublish,
  planPolicies,
  readPolicyReach,
  refuseCountsChangesOf,
} from "./policyPublishPlan";
import {
  appendRulesHistory,
  employeesOf,
  existingTerms,
  rulesChanged,
  versionOf,
} from "./policyRules";
import type { TimeOffService } from "./timeOffService";

/** What Publish on a set of terms would do from a date. */
export interface PublishSuggestions {
  /** The terms' unpublished versions, as Publish takes them; a null type is the working week. */
  versions: { id: string; revision: number; timeOffTypeId: string | null }[];
  /**
   * These terms first, then every other owner it reaches, each named, with the versions it gets
   * and whom they reach.
   */
  owners: { owner: AssignmentOwner; name: string; versionIds: string[]; reached: Employee[] }[];
}

/** What Publish on terms asks for. */
export interface PublishTermsInput {
  termsId: string;
  versions: readonly { id: string; revision: number }[];
  startDate: string;
  owners: readonly { employeeId?: string | null; termsId?: string | null }[];
}

/** What Publish needs: its transaction, the working weeks it publishes with, and the allowance engine. */
export interface PublishDependencies {
  orm: Orm;
  transact: Transact;
  logger: Logger;
  today: () => CalendarDate;
  timeOff: Pick<TimeOffService, "ensureAllowances">;
  employeeReads: EmployeeReadService;
  workingPatterns: Pick<WorkingPatternService, "readPublish" | "publish">;
}

/** What Publish on the terms would do from `from`: their unpublished versions and every owner it reaches. */
export async function readPublishSuggestions(
  dependencies: PublishDependencies,
  ctx: SecurityContext,
  input: { termsId: string; from: string },
): Promise<PublishSuggestions> {
  ctx.require("MANAGE_WORKSPACE");
  const { transact, employeeReads, workingPatterns } = dependencies;
  const from = parseDateField("from", input.from);
  return transact(async (tx) => {
    await timeOffPolicyRepository(tx).sharePolicies();
    const termsId = await existingTerms(employeeReads, tx, input.termsId);
    const week = await workingPatterns.readPublish(tx, { termsId, from });
    const policies = await planPolicies(tx, termsId, from);
    const owners = await reachedOwners(employeeReads, tx, { termsId, week, policies, from });
    return {
      versions: [
        ...(week ? [{ ...week.version, timeOffTypeId: null }] : []),
        ...policies.map(({ version, policy }) => ({
          ...version,
          timeOffTypeId: policy.timeOffType.id,
        })),
      ].map(({ id, revision, timeOffTypeId }) => ({ id, revision, timeOffTypeId })),
      owners: await nameOwners(employeeReads, tx, owners),
    };
  });
}

/**
 * Publishes every unpublished version of the terms and gives each to the `owners` using what it
 * replaces from `startDate`, keeping their allowances, in one transaction; returns the terms after.
 */
export async function publishTerms(
  dependencies: PublishDependencies,
  ctx: SecurityContext,
  input: PublishTermsInput,
): Promise<TermsOverview> {
  ctx.require("MANAGE_WORKSPACE");
  const { transact, logger, today, employeeReads, workingPatterns } = dependencies;
  const from = parseChangeDate(input.startDate, today());
  const owners = parseOwners(input.owners);
  const result = await transact(async (tx) => {
    await timeOffPolicyRepository(tx).lockPolicies();
    const termsId = await existingTerms(employeeReads, tx, input.termsId);
    const week = await workingPatterns.readPublish(tx, { termsId, from });
    const policies = await planPolicies(tx, termsId, from);
    const allPolicies = await timeOffPolicyRepository(tx).findAll();
    for (const publish of policies) refuseCountsChangesOf(publish, owners, allPolicies);
    refuseChangedVersions(input.versions, [
      ...(week ? [week.version] : []),
      ...policies.map(({ version }) => version),
    ]);
    refuseUnsuggestedOwners(owners, [
      { termsId },
      ...(week?.owners.map(({ owner }) => owner) ?? []),
      ...policies.flatMap((publish) => publish.owners.map(({ owner }) => owner)),
    ]);
    const ensured = await applyPublish(dependencies, ctx, tx, {
      termsId,
      week,
      policies,
      owners,
      from,
    });
    return { termsId, versionCount: policies.length + (week ? 1 : 0), ...ensured };
  });
  logger.info(
    { ...result, startDate: from, ownerCount: owners.length },
    "Published terms' working week and time off rules",
  );
  return (await employeeReads.readTermsOverview(result.termsId, today()))!;
}

/** Publishes the week, then each type's rules, and keeps the allowances of everyone they reach. */
async function applyPublish(
  { timeOff, employeeReads, workingPatterns }: PublishDependencies,
  ctx: SecurityContext,
  tx: Tx,
  {
    termsId,
    week,
    policies,
    owners,
    from,
  }: {
    termsId: string;
    week: WorkingPatternPublish | null;
    policies: readonly PolicyPublish[];
    owners: readonly AssignmentOwner[];
    from: CalendarDate;
  },
): Promise<EnsuredAllowances> {
  const weekPeople = week
    ? (await workingPatterns.publish(ctx, tx, { termsId, from, owners })).employeeIds
    : [];
  const runs = [
    await timeOff.ensureAllowances(ctx, tx, {
      employeeIds: weekPeople,
      cause: { kind: "WORKING_PATTERN_CHANGED", ref: from },
    }),
  ];
  for (const publish of policies) {
    const people = await publishPolicy(employeeReads, ctx, tx, publish, owners, from);
    runs.push(
      await timeOff.ensureAllowances(ctx, tx, {
        employeeIds: people,
        cause: rulesChanged(publish.policy.id, from),
      }),
    );
  }
  return {
    allowancesCreated: runs.reduce((sum, run) => sum + run.allowancesCreated, 0),
    linesAppended: runs.reduce((sum, run) => sum + run.linesAppended, 0),
  };
}

/**
 * Publishes one policy version and gives it to each ticked owner its plan reaches, with a line in
 * the owner's history; returns the employees whose rules may have changed.
 */
async function publishPolicy(
  employeeReads: EmployeeReadService,
  ctx: SecurityContext,
  tx: Tx,
  { version, policy, owners: plans }: PolicyPublish,
  owners: readonly AssignmentOwner[],
  from: CalendarDate,
): Promise<string[]> {
  const repository = timeOffPolicyRepository(tx);
  const people = new Set<string>();
  for (const { owner, plan, replaced } of plans) {
    if (!owners.some((ticked) => isSameOwner(ticked, owner))) {
      continue;
    }
    await applyAssignmentPlan(repository, plan, (span) =>
      repository.insertAssignment({
        ...span,
        owner,
        versionId: version.id,
        timeOffPolicyId: policy.id,
        timeOffTypeId: policy.timeOffType.id,
      }),
    );
    await appendRulesHistory(ctx, tx, owner, policy.timeOffType, {
      before: replaced && {
        ...versionOf([policy], replaced.versionId),
        startDate: replaced.startDate,
      },
      after: { ...version, startDate: from },
    });
    for (const id of await employeesOf(employeeReads, tx, owner)) people.add(id);
  }
  await repository.publishVersion(version.id);
  return [...people];
}

interface ReachedOwner {
  owner: AssignmentOwner;
  versionIds: string[];
  reachedIds: Set<string>;
}

/** These terms first, then every other owner, each with the versions it gets and whom they reach. */
async function reachedOwners(
  employeeReads: EmployeeReadService,
  tx: Tx,
  {
    termsId,
    week,
    policies,
    from,
  }: {
    termsId: string;
    week: WorkingPatternPublish | null;
    policies: readonly PolicyPublish[];
    from: CalendarDate;
  },
): Promise<ReachedOwner[]> {
  const owners: ReachedOwner[] = [{ owner: { termsId }, versionIds: [], reachedIds: new Set() }];
  const add = (owner: AssignmentOwner, versionId: string, reachedIds: readonly string[]) => {
    const known = owners.find((entry) => isSameOwner(entry.owner, owner));
    const entry = known ?? { owner, versionIds: [], reachedIds: new Set<string>() };
    entry.versionIds.push(versionId);
    for (const id of reachedIds) entry.reachedIds.add(id);
    if (!known) owners.push(entry);
  };
  for (const { owner, reachedIds } of week?.owners ?? []) {
    add(owner, week!.version.id, reachedIds);
  }
  for (const publish of policies) {
    for (const ownerPlan of publish.owners) {
      add(
        ownerPlan.owner,
        publish.version.id,
        await readPolicyReach(employeeReads, tx, publish, ownerPlan, from),
      );
    }
  }
  return owners;
}

/** The owners with their names and the people they reach, by name. */
async function nameOwners(
  employeeReads: EmployeeReadService,
  tx: Tx,
  owners: readonly ReachedOwner[],
): Promise<PublishSuggestions["owners"]> {
  const termsNames = await employeeReads.readTermsNames(
    tx,
    owners.flatMap(({ owner }) => ("termsId" in owner ? [owner.termsId] : [])),
  );
  const people = await employeeReads.readEmployeesByName(
    tx,
    owners.flatMap(({ owner }) => ("employeeId" in owner ? [owner.employeeId] : [])),
  );
  const named = [];
  for (const { owner, versionIds, reachedIds } of owners) {
    const person = "employeeId" in owner ? people.find(({ id }) => id === owner.employeeId) : null;
    named.push({
      owner,
      name:
        "termsId" in owner
          ? termsNames.get(owner.termsId)!
          : `${person!.firstName} ${person!.lastName}`,
      versionIds,
      reached: await employeeReads.readEmployeesByName(tx, [...reachedIds]),
    });
  }
  return named;
}

/** The owners Publish is asked for: each names one employee or one set of terms. */
function parseOwners(owners: PublishTermsInput["owners"]): AssignmentOwner[] {
  return owners.map(({ employeeId, termsId }) => {
    const employee = employeeId ? parseUuid(employeeId) : null;
    const terms = termsId ? parseUuid(termsId) : null;
    if ((employee === null) === (terms === null)) {
      throw invalidInput([{ field: "owners", code: "invalid" }]);
    }
    return employee ? { employeeId: employee } : { termsId: terms! };
  });
}

/** Refuses, with CONFLICT, unpublished versions that are not exactly the ones asked, at their revisions. */
function refuseChangedVersions(
  asked: readonly { id: string; revision: number }[],
  current: readonly { id: string; revision: number }[],
) {
  if (current.length === 0) {
    throw new ApplicationError("CONFLICT", "These terms have nothing to publish.");
  }
  const same =
    asked.length === current.length &&
    current.every(({ id, revision }) =>
      asked.some((version) => version.id === id && version.revision === revision),
    );
  if (!same) {
    throw new ApplicationError("CONFLICT", "These changes were saved again since you opened them.");
  }
}

/** Refuses an owner Publish does not suggest as invalid input. */
function refuseUnsuggestedOwners(
  owners: readonly AssignmentOwner[],
  suggested: readonly AssignmentOwner[],
) {
  if (owners.some((owner) => !suggested.some((known) => isSameOwner(known, owner)))) {
    throw invalidInput([{ field: "owners", code: "not_using_policy" }]);
  }
}
