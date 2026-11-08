import DataLoader from "dataloader";

import {
  mutationPayload,
  perRequest,
  type Resolvers,
  type ResolversTypes,
  toEnum,
} from "../../../core/graphql";
import { todayInLondon } from "../../../utils";
import { earliestChangeDate } from "../../employees";
import type {
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
  type TimeOffTypeIdentity,
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
      createPolicy: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TimeOffPolicyCreatePayload"]>(
          async () => ({
            timeOffPolicy: await policies.createPolicy(context.getActor(), {
              ...input,
              rules: toStoredRules(input.rules),
            }),
          }),
          ["INVALID_INPUT", "CONFLICT"],
        ),
      changePolicy: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TimeOffPolicyChangePayload"]>(
          async () => ({
            timeOffPolicy: await policies.changePolicy(context.getActor(), {
              ...input,
              rules: toStoredRules(input.rules),
            }),
          }),
          ["INVALID_INPUT", "NOT_FOUND"],
        ),
      cancelPolicyChange: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TimeOffPolicyCancelChangePayload"]>(
          async () => ({
            timeOffPolicy: await policies.cancelPolicyChange(context.getActor(), input),
          }),
          ["NOT_FOUND", "CONFLICT"],
        ),
    },
    Employee: {
      timeOffTypes: (employee, _args, context) => loaders(context).timeOffTypes.load(employee.id),
    },
    Terms: {
      timeOff: async (terms, { timeOffTypeId }, context) => {
        const rows = await loaders(context).termsTimeOff.load(terms.id);
        return timeOffTypeId
          ? rows.filter(({ timeOffType }) => timeOffType.id === timeOffTypeId)
          : rows;
      },
    },
    TimeOffWithPolicies: {
      timeOffType: ({ timeOffType }) => toGraphqlType(timeOffType),
      versions: ({ versions }) => versions.map(toGraphqlVersion),
      offerReach: ({ termsId, timeOffType }, { from }, context) =>
        policies.readOfferReach(context.getActor(), {
          termsId,
          timeOffTypeId: timeOffType.id,
          from,
        }),
      earliestOffer: () => earliestChangeDate(todayInLondon()),
    },
    TimeOffPolicy: {
      timeOffType: ({ timeOffType }) => toGraphqlType(timeOffType),
      versions: ({ versions }) => {
        const today = todayInLondon();
        return versions
          .filter(({ endDate }) => endDate === null || endDate >= today)
          .map(toGraphqlVersion);
      },
      reach: ({ id }, { from }, context) =>
        policies.readPolicyReach(context.getActor(), { timeOffPolicyId: id, from }),
      earliestChange: () => earliestChangeDate(todayInLondon()),
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
  };
}

/** A type's identity from GraphQL input, its enums in the stored lower case. */
function toIdentity(input: {
  name: string;
  icon: string;
  colour: string;
  private: boolean;
}): TimeOffTypeIdentity {
  return {
    name: input.name,
    icon: input.icon.toLowerCase() as TimeOffTypeIcon,
    colour: input.colour.toLowerCase() as TimeOffTypeColour,
    private: input.private,
  };
}

/** A policy version as GraphQL shows it: its yearly allowance from its rules, enums in capitals. */
function toGraphqlVersion(version: PolicyVersion) {
  const yearly = version.rules.find((rule) => rule.kind === "yearly_entitlement");
  return {
    id: version.id,
    startDate: version.startDate,
    endDate: version.endDate,
    balance: BALANCE_KINDS[version.balance],
    bankHolidays: version.bankHolidays && toEnum(version.bankHolidays),
    leaveYearStart: version.leaveYear && {
      kind: toEnum(version.leaveYear.kind),
      month:
        version.leaveYear.kind === "leave_year_from_fixed_date" ? version.leaveYear.month : null,
      day: version.leaveYear.kind === "leave_year_from_fixed_date" ? version.leaveYear.day : null,
    },
    yearlyEntitlement: yearly && {
      days: yearly.entitlementDays,
      daysPerWeek: yearly.entitlementDaysPerWeek,
    },
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
