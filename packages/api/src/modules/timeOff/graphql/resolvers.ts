import DataLoader from "dataloader";

import {
  type GraphqlContext,
  mutationPayload,
  perRequest,
  type Resolvers,
  type ResolversTypes,
  toEnum,
} from "../../../core/graphql";
import type { CalendarDate } from "../../../utils";
import type { TermsMovePreview } from "../../employees";
import type {
  PersonTimeOff,
  TimeOffPolicyService,
  TimeOffSetupService,
  TimeOffService,
  TimeOffWithPolicies,
} from "../app";
import {
  DEFAULT_TIME_OFF_TYPE_LOOK,
  type PolicyVersion,
  type TimeOffType,
  type TimeOffTypeColour,
  type TimeOffTypeIdentityInput,
  type TimeOffTypeIcon,
} from "../domain";

type TimeOffTypeRow = ResolversTypes["EmployeeTimeOffType"];

const BALANCE_KINDS = {
  balance_from_allowance: "BALANCE_FROM_ALLOWANCE",
  unlimited_balance: "UNLIMITED_BALANCE",
  no_balance: "NO_BALANCE",
} as const;

export function createResolvers(
  timeOff: TimeOffService,
  timeOffSetup: TimeOffSetupService,
  policies: TimeOffPolicyService,
): Resolvers {
  const loaders = perRequest((context) => ({
    timeOffTypes: new DataLoader<string, TimeOffTypeRow[] | null>(async (employeeIds) => {
      const read = await timeOff.readTimeOffTypes(context.getActor(), { employeeIds });
      return employeeIds.map(
        (id) =>
          read.get(id)?.map((row) => ({
            ...row,
            timeOffType: toGraphqlType(row.timeOffType),
            balance: BALANCE_KINDS[row.balance],
          })) ?? null,
      );
    }),
    personTimeOff: new DataLoader<string, PersonTimeOff[] | null>(async (employeeIds) => {
      const read = await timeOff.readPersonTimeOff(context.getActor(), { employeeIds });
      return employeeIds.map((id) => read.get(id) ?? null);
    }),
    previewTimeOff: previewTimeOffLoader(timeOff, context),
    termsTimeOff: new DataLoader<string, TimeOffWithPolicies[]>(async (termsIds) => {
      const read = await timeOff.readTermsTimeOff(context.getActor(), termsIds);
      return termsIds.map((id) => read.get(id)!);
    }),
  }));
  return {
    Query: {
      timeOffSettings: async (_parent, _args, context) => {
        const list = await timeOff.listTimeOffTypes(context.getActor());
        return {
          peopleWithTimeOff: list.peopleWithTimeOff,
          timeOffTypes: list.timeOffTypes.map((row) => ({
            ...row,
            timeOffType: toGraphqlType(row.timeOffType),
            balance: toBalanceKind(row.balance),
          })),
        };
      },
      timeOffSetup: async (_parent, _args, context) => {
        const setup = await timeOffSetup.readTimeOffSetup(context.getActor());
        return {
          annualLeavePolicies: setup.annualLeavePolicies.map(({ key, ...policy }) => ({
            ...policy,
            key: toEnum(key),
          })),
          bankHolidayCalendars: setup.bankHolidayCalendars.map(({ calendar, countThisYear }) => ({
            calendar: toEnum(calendar),
            countThisYear,
          })),
        };
      },
      locationCalendarSuggestions: async (_parent, { locationNames }, context) =>
        (await timeOffSetup.suggestLocationCalendars(context.getActor(), { locationNames })).map(
          (suggestion) => ({
            ...suggestion,
            bankHolidayCalendar: toEnum(suggestion.bankHolidayCalendar),
          }),
        ),
    },
    Mutation: {
      timeOff: () => ({}),
    },
    TimeOffMutations: {
      createType: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TimeOffTypeCreatePayload"]>(
          async () => ({
            timeOffType: toGraphqlType(
              await timeOff.createType(context.getActor(), toIdentity(input)),
            ),
          }),
          ["INVALID_INPUT"],
        ),
      changeType: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TimeOffTypeChangePayload"]>(
          async () => ({
            timeOffType: toGraphqlType(
              await timeOff.changeType(context.getActor(), {
                id: input.timeOffTypeId,
                ...toIdentity(input),
              }),
            ),
          }),
          ["INVALID_INPUT", "NOT_FOUND"],
        ),
      deleteType: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TimeOffTypeDeletePayload"]>(async () => {
          await timeOff.deleteType(context.getActor(), { id: input.timeOffTypeId });
          return { deletedTimeOffTypeId: input.timeOffTypeId };
        }, ["NOT_FOUND", "CONFLICT"]),
      saveTimeOffPolicy: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TimeOffPolicySavePayload"]>(
          async () => ({
            rules: await policies.saveTimeOffPolicy(context.getActor(), {
              ...input,
              rules: toStoredRules(input.rules),
            }),
          }),
          ["INVALID_INPUT"],
        ),
      discardTimeOffPolicy: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TimeOffPolicyDiscardPayload"]>(async () => {
          await policies.discardTimeOffPolicy(context.getActor(), input);
          return { discardedVersionId: input.versionId };
        }, ["NOT_FOUND"]),
      cancelPolicyChange: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TimeOffPolicyCancelChangePayload"]>(async () => {
          await policies.cancelPolicyChange(context.getActor(), input);
          return { cancelledAssignmentId: input.assignmentId };
        }, ["NOT_FOUND", "CONFLICT"]),
      publishTerms: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TermsPublishPayload"]>(async () => {
          return { terms: await policies.publishTerms(context.getActor(), input) };
        }, ["INVALID_INPUT", "CONFLICT"]),
    },
    Employee: {
      timeOffTypes: (employee, _args, context) => loaders(context).timeOffTypes.load(employee.id),
    },
    EmployeeEmploymentTerms: {
      timeOff: ({ employeeId, move, from }, _args, context) =>
        from
          ? loaders(context).previewTimeOff.load({ employeeId, move, from })
          : loaders(context).personTimeOff.load(employeeId),
    },
    PersonTimeOff: {
      timeOffType: ({ timeOffType }) => toGraphqlType(timeOffType),
      versions: ({ versions }) =>
        versions.map(({ source, startDate, endDate, version }) => ({
          source: toEnum(source),
          startDate,
          endDate,
          rules: { ...toGraphqlRules(version), id: version.id, startDate, endDate },
        })),
    },
    Terms: {
      timeOff: async (terms, { timeOffTypeId }, context) => {
        const rows = await loaders(context).termsTimeOff.load(terms.id);
        return timeOffTypeId
          ? rows.filter(({ timeOffType }) => timeOffType.id === timeOffTypeId)
          : rows;
      },
      hasUnpublishedChanges: async (terms, _args, context) =>
        terms.unpublishedWorkingWeek !== null ||
        (await loaders(context).termsTimeOff.load(terms.id)).some(
          ({ unpublished }) => unpublished !== null,
        ),
      publishSuggestions: async (terms, { from }, context) => {
        const suggestions = await policies.readPublishSuggestions(context.getActor(), {
          termsId: terms.id,
          from,
        });
        return {
          versions: suggestions.versions,
          owners: suggestions.owners.map(({ owner, ...rest }) => ({
            ...rest,
            termsId: "termsId" in owner ? owner.termsId : null,
            employeeId: "employeeId" in owner ? owner.employeeId : null,
          })),
        };
      },
    },
    TimeOffWithPolicies: {
      timeOffType: ({ timeOffType }) => toGraphqlType(timeOffType),
      versions: ({ versions }) =>
        versions.map(({ id, startDate, endDate, version }) => ({
          ...toGraphqlRules(version),
          id,
          startDate,
          endDate,
        })),
      unpublished: ({ unpublished }) => unpublished,
    },
    UnpublishedTimeOffRules: {
      balance: ({ balance }) => BALANCE_KINDS[balance],
      bankHolidays: ({ bankHolidays }) => bankHolidays && toEnum(bankHolidays),
      leaveYearStart: (version) => toGraphqlRules(version).leaveYearStart,
      yearlyEntitlement: (version) => toGraphqlRules(version).yearlyEntitlement,
    },
  };
}

/** A time off type with its icon and colour as GraphQL values, the defaults filling in for none. */
function toGraphqlType(type: TimeOffType) {
  return {
    id: type.id,
    name: type.name,
    icon: toEnum(type.icon ?? DEFAULT_TIME_OFF_TYPE_LOOK.icon),
    colour: toEnum(type.colour ?? DEFAULT_TIME_OFF_TYPE_LOOK.colour),
    typeKey: type.typeKey && toEnum(type.typeKey),
    private: type.private,
    defaultRules: {
      balance: BALANCE_KINDS[type.defaultRules.balance],
      entitlementDays: type.defaultRules.entitlementDays,
      bankHolidays: type.defaultRules.bankHolidays && toEnum(type.defaultRules.bankHolidays),
    },
  };
}

/** A type's identity from GraphQL input, its enums in the stored lower case. */
function toIdentity(
  input: ResolversTypes["TimeOffTypeCreateInput"] | ResolversTypes["TimeOffTypeChangeInput"],
): TimeOffTypeIdentityInput {
  return {
    name: input.name,
    icon: input.icon.toLowerCase() as TimeOffTypeIcon,
    colour: input.colour.toLowerCase() as TimeOffTypeColour,
    private: input.private,
    defaultRules: toStoredRules(input.defaultRules),
  };
}

/** A policy version's rules as GraphQL shows them: its yearly allowance from its rules, enums in capitals. */
function toGraphqlRules(version: PolicyVersion) {
  const yearly = version.rules.find((rule) => rule.kind === "yearly_entitlement");
  return {
    balance: BALANCE_KINDS[version.balance],
    bankHolidays: version.bankHolidays && toEnum(version.bankHolidays),
    leaveYearStart: version.leaveYear && {
      kind: toEnum(version.leaveYear.kind),
      month:
        version.leaveYear.kind === "leave_year_from_fixed_date" ? version.leaveYear.month : null,
      day: version.leaveYear.kind === "leave_year_from_fixed_date" ? version.leaveYear.day : null,
    },
    yearlyEntitlement: yearly
      ? { days: yearly.entitlementDays, daysPerWeek: yearly.entitlementDaysPerWeek }
      : null,
  };
}

/** Rules sent through GraphQL as the service takes them: enum values in lower case. */
function toStoredRules({
  balance,
  entitlementDays,
  bankHolidays,
}: ResolversTypes["TimeOffRulesInput"]) {
  return {
    balance: balance.toLowerCase(),
    entitlementDays,
    bankHolidays: bankHolidays?.toLowerCase(),
  };
}

function toBalanceKind(balance: PolicyVersion["balance"] | null) {
  return balance && BALANCE_KINDS[balance];
}

/** A person as a preview reads them: from a date, and maybe as if after a move. */
interface PreviewedPerson {
  employeeId: string;
  move?: TermsMovePreview;
  from: CalendarDate;
}

function readKey({ move, from }: PreviewedPerson): string {
  return `${move?.termsId ?? ""}:${move?.startDate ?? ""}:${from}`;
}

function personKey(person: PreviewedPerson): string {
  return `${readKey(person)}:${person.employeeId}`;
}

/**
 * Each person's rules for a preview, from a date and maybe as if after a move: every person read
 * the same way is one read.
 */
function previewTimeOffLoader(timeOff: TimeOffService, context: GraphqlContext) {
  return new DataLoader<PreviewedPerson, PersonTimeOff[] | null, string>(
    async (keys) => {
      const read = new Map<string, PersonTimeOff[]>();
      for (const people of Map.groupBy(keys, readKey).values()) {
        const { move, from } = people[0]!;
        const employeeIds = people.map(({ employeeId }) => employeeId);
        const rules = await timeOff.readPersonTimeOff(context.getActor(), {
          employeeIds,
          move,
          from,
        });
        for (const [employeeId, rows] of rules)
          read.set(personKey({ employeeId, move, from }), rows);
      }
      return keys.map((key) => read.get(personKey(key)) ?? null);
    },
    { cacheKeyFn: personKey },
  );
}
