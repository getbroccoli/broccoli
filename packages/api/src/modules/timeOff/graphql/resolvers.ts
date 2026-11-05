import DataLoader from "dataloader";

import { perRequest, type Resolvers, type ResolversTypes } from "../../../core/graphql";
import type { TimeOffSetupService, TimeOffService } from "../app";
import { DEFAULT_TIME_OFF_TYPE_LOOK, type TimeOffPolicy, type TimeOffType } from "../domain";

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

function toBalanceKind(balance: TimeOffPolicy["balance"] | null) {
  return balance && BALANCE_KINDS[balance];
}
