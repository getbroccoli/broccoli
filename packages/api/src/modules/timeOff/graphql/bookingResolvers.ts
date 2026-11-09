import DataLoader from "dataloader";

import {
  mutationPayload,
  perRequest,
  type Resolvers,
  type ResolversTypes,
  toEnum,
} from "../../../core/graphql";
import type { BookingInput, BookingPreview, TimeOffBookingService, WhosOut } from "../app";
import type { TimeOffType } from "../domain";
import { BALANCE_KINDS, toGraphqlType } from "./graphqlValues";

/** Booking, cancelling and who's out; merged into the module's resolvers. */
export function bookingResolvers(booking: TimeOffBookingService) {
  const loaders = perRequest((context) => ({
    whosOutByRange: new Map<string, DataLoader<string, WhosOut | null>>(),
    types: new DataLoader<string, TimeOffType | null>(async (ids) => {
      const types = await booking.readTypes(context.getActor());
      return ids.map((id) => types.find((type) => type.id === id) ?? null);
    }),
  }));
  return {
    Query: {
      timeOffBookingPreview: async (_parent, { input }, context) =>
        toGraphqlPreview(await booking.previewBooking(context.getActor(), toBookingInput(input))),
    },
    TimeOffMutations: {
      bookTimeOff: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TimeOffBookPayload"]>(
          async () => ({
            timeOff: await booking.bookTimeOff(context.getActor(), toBookingInput(input)),
          }),
          ["INVALID_INPUT", "NOT_FOUND"],
        ),
      cancelTimeOff: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TimeOffCancelPayload"]>(async () => {
          await booking.cancelTimeOff(context.getActor(), { timeOffId: input.timeOffId });
          return { cancelledTimeOffId: input.timeOffId };
        }, ["NOT_FOUND", "CONFLICT"]),
    },
    Employee: {
      whosOut: async (employee, { from, until }, context) => {
        const byRange = loaders(context).whosOutByRange;
        const key = `${from}:${until}`;
        const loader =
          byRange.get(key) ??
          new DataLoader<string, WhosOut | null>(async (employeeIds) => {
            const read = await booking.readWhosOut(context.getActor(), {
              employeeIds,
              from,
              until,
            });
            return employeeIds.map((id) => read.get(id) ?? null);
          });
        byRange.set(key, loader);
        const { days, timeOff } = (await loader.load(employee.id)) ?? { days: [], timeOff: [] };
        return { days: days.map((day) => ({ ...day, kind: toEnum(day.kind) })), timeOff };
      },
    },
    TimeOff: {
      timeOffType: async ({ timeOffTypeId }, _args, context) => {
        const type = timeOffTypeId && (await loaders(context).types.load(timeOffTypeId));
        return type ? toGraphqlType(type) : null;
      },
      startDate: ({ days }) => days[0]!.date,
      endDate: ({ days }) => days.at(-1)!.date,
      days: ({ days }) => days.map(({ date, dayPart }) => ({ date, dayPart: toEnum(dayPart) })),
    },
  } satisfies Resolvers;
}

/** A booking as the service takes it, from GraphQL input. */
function toBookingInput(input: ResolversTypes["TimeOffBookInput"]): BookingInput {
  return {
    ...input,
    halfDays: input.halfDays?.map(({ date, dayPart }) => ({
      date,
      dayPart: dayPart.toLowerCase() as "morning" | "afternoon",
    })),
  };
}

function toGraphqlPreview(preview: BookingPreview) {
  return {
    ...preview,
    days: preview.days.map((day) => ({
      ...day,
      dayPart: toEnum(day.dayPart),
      reason: toEnum(day.reason),
    })),
    balances: preview.balances.map((change) => ({
      ...change,
      balance: BALANCE_KINDS[change.balance],
    })),
    refusal: preview.refusal && { ...preview.refusal, reason: toEnum(preview.refusal.reason) },
  };
}
