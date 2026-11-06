import DataLoader from "dataloader";

import { perRequest, type Resolvers, type ResolversTypes, toEnum } from "../../../core/graphql";
import type { TimeOffSetupService, TimeOffService } from "../app";
import type { TimeOffWithPolicies } from "../app";
import { DEFAULT_TIME_OFF_TYPE_LOOK, type PolicyVersion, type TimeOffType } from "../domain";

type TimeOffTypeRow = ResolversTypes["EmployeeTimeOffType"];

const BALANCE_KINDS = {
  balance_from_allowance: "BALANCE_FROM_ALLOWANCE",
  unlimited_balance: "UNLIMITED_BALANCE",
  no_balance: "NO_BALANCE",
} as const;

export function createResolvers(
  timeOff: TimeOffService,
  timeOffSetup: TimeOffSetupService,
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
    Employee: {
      timeOffTypes: (employee, _args, context) => loaders(context).timeOffTypes.load(employee.id),
    },
    Terms: {
      timeOff: async (terms, _args, context) =>
        (await loaders(context).termsTimeOff.load(terms.id)).map(({ timeOffType, versions }) => ({
          timeOffType: toGraphqlType(timeOffType),
          versions: versions.map(toGraphqlVersion),
        })),
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

function toBalanceKind(balance: PolicyVersion["balance"] | null) {
  return balance && BALANCE_KINDS[balance];
}
