import DataLoader from "dataloader";

import {
  mutationPayload,
  perRequest,
  type Resolvers,
  type ResolversTypes,
} from "../../../core/graphql";
import type { TimeOffSetupService, TimeOffService, TimeOffTypeSettings } from "../app";
import { DEFAULT_TIME_OFF_TYPE_LOOK, type SaveTimeOffTypeInput } from "../domain";

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
    Mutation: {
      timeOffType: () => ({}),
    },
    TimeOffTypeMutations: {
      save: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TimeOffTypeSavePayload"]>(async () => {
          const saved = await timeOff.saveTimeOffType(context.getActor(), toSaveInput(input));
          return { ...saved, timeOffType: toGraphqlSummary(saved.timeOffType) };
        }, ["INVALID_INPUT", "NOT_FOUND", "CONFLICT"]),
      delete: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TimeOffTypeDeletePayload"]>(async () => {
          const { id } = await timeOff.deleteTimeOffType(context.getActor(), input);
          return { deletedTimeOffTypeId: id };
        }, ["NOT_FOUND", "CONFLICT"]),
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
    TimeOffType: {
      reasonVisibleToColleagues: (type) => !type.private,
      icon: (type) => toEnum(type.icon ?? DEFAULT_TIME_OFF_TYPE_LOOK.icon),
      colour: (type) => toEnum(type.colour ?? DEFAULT_TIME_OFF_TYPE_LOOK.colour),
      history: (type, { first, after }, context) =>
        timeOff.readTimeOffTypeHistory(context.getActor(), type.id, {
          first: first ?? undefined,
          after,
        }),
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

/** A type with its policies as GraphQL values. */
function toGraphqlSummary({ policies, ...summary }: TimeOffTypeSettings) {
  return {
    ...summary,
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

/** A save as the service takes it: GraphQL's enum values in their stored form. */
function toSaveInput({
  icon,
  colour,
  policies,
  addPolicies,
  ...input
}: ResolversTypes["TimeOffTypeSaveInput"]): SaveTimeOffTypeInput {
  return {
    ...input,
    icon: icon && toStored(icon),
    colour: colour && toStored(colour),
    policies: policies?.map(({ balance, bankHolidays, ...change }) => ({
      ...change,
      balance: balance && toStored(balance),
      bankHolidays: bankHolidays && toStored(bankHolidays),
    })),
    addPolicies: addPolicies?.map(({ balance, bankHolidays, ...policy }) => ({
      ...policy,
      balance: toStored(balance),
      bankHolidays: bankHolidays && toStored(bankHolidays),
    })),
  };
}

/** A GraphQL enum value in its stored form, which is the same words in lower case. */
function toStored<Value extends string>(value: Value): Lowercase<Value> {
  return value.toLowerCase() as Lowercase<Value>;
}

/** The first call's promise, shared by every later call. */
function memoize<T>(load: () => Promise<T>): () => Promise<T> {
  let loaded: Promise<T> | undefined;
  return () => (loaded ??= load());
}
