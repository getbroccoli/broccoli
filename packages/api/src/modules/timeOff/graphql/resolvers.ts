import type { Resolvers } from "../../../core/graphql";
import type { LeaveSetupService } from "../app";

export function createResolvers(leaveSetup: LeaveSetupService): Resolvers {
  return {
    Query: {
      leaveSetup: async (_parent, _args, context) => {
        const setup = await leaveSetup.readLeaveSetup(context.getActor());
        return {
          ...setup,
          bankHolidayCalendars: setup.bankHolidayCalendars.map(({ calendar, countThisYear }) => ({
            calendar: toEnum(calendar),
            countThisYear,
          })),
        };
      },
      locationCalendarSuggestions: async (_parent, { locationNames }, context) =>
        (await leaveSetup.suggestLocationCalendars(context.getActor(), { locationNames })).map(
          (suggestion) => ({
            ...suggestion,
            bankHolidayCalendar: toEnum(suggestion.bankHolidayCalendar),
          }),
        ),
    },
  };
}

/** A stored value as its GraphQL enum value, which is the same words in capitals. */
function toEnum<Value extends string>(value: Value): Uppercase<Value> {
  return value.toUpperCase() as Uppercase<Value>;
}
