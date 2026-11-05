import DataLoader from "dataloader";

import { perRequest, type Resolvers, type ResolversTypes } from "../../../core/graphql";
import type { TimeOffSetupService, TimeOffService, TimeOffTypeSettings } from "../app";
import { DEFAULT_TIME_OFF_TYPE_LOOK, type TimeOffType } from "../domain";

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
    timeOffTypeList: memoize(() => timeOff.listTimeOffTypes(context.getActor())),
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
  }));
  return {
    Query: {
      timeOffSettings: () => ({}),
      timeOffSetup: async (_parent, _args, context) => {
        const setup = await timeOffSetup.readTimeOffSetup(context.getActor());
        return {
          ...setup,
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
    TimeOffSettings: {
      timeOffTypes: async (_parent, _args, context) =>
        (await loaders(context).timeOffTypeList()).timeOffTypes.map(toGraphqlSummary),
      peopleWithTimeOff: async (_parent, _args, context) =>
        (await loaders(context).timeOffTypeList()).peopleWithTimeOff,
      timeOffType: async (_parent, { id }, context) => {
        const settings = await timeOff.readTimeOffTypeSettings(context.getActor(), { id });
        return settings && toGraphqlSummary(settings);
      },
    },
    Employee: {
      timeOffTypes: (employee, _args, context) => loaders(context).timeOffTypes.load(employee.id),
    },
  };
}

/** A stored value as its GraphQL enum value, which is the same words in capitals. */
function toEnum<Value extends string>(value: Value): Uppercase<Value> {
  return value.toUpperCase() as Uppercase<Value>;
}

/** A time off type with its icon and colour as GraphQL values, the defaults filling in for none. */
function toGraphqlType(type: TimeOffType) {
  return {
    id: type.id,
    name: type.name,
    icon: toEnum(type.icon ?? DEFAULT_TIME_OFF_TYPE_LOOK.icon),
    colour: toEnum(type.colour ?? DEFAULT_TIME_OFF_TYPE_LOOK.colour),
  };
}

/** A type with its policies as GraphQL values. */
function toGraphqlSummary({ timeOffType, policies, ...summary }: TimeOffTypeSettings) {
  return {
    ...summary,
    timeOffType: toGraphqlType(timeOffType),
    policies: policies.map(({ balance, allowance, leaveYear, ...policy }) => ({
      ...policy,
      balance: BALANCE_KINDS[balance],
      allowance: allowance && { ...allowance, bankHolidays: toEnum(allowance.bankHolidays) },
      leaveYear: leaveYear && {
        kind: toEnum(leaveYear.kind),
        month: "month" in leaveYear ? leaveYear.month : null,
        day: "day" in leaveYear ? leaveYear.day : null,
      },
    })),
  };
}

/** The first call's promise, shared by every later call. */
function memoize<T>(load: () => Promise<T>): () => Promise<T> {
  let loaded: Promise<T> | undefined;
  return () => (loaded ??= load());
}
