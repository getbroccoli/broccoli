import DataLoader from "dataloader";

import {
  mutationPayload,
  perRequest,
  type Resolvers,
  type ResolversTypes,
  toEnum,
} from "../../../core/graphql";
import type { EmployeeReadService } from "../../employees";
import type { StoredTimeOff, TimeOffRequestService } from "../app";
import { dayCount } from "../domain";
import { toBookingInput } from "./bookingResolvers";

/** Requesting time off, its status and decision, and a person's requests; merged into the module's resolvers. */
export function requestResolvers(
  requests: TimeOffRequestService,
  employees: Pick<EmployeeReadService, "readEmployees">,
) {
  const loaders = perRequest((context) => ({
    statuses: new DataLoader<string, StoredTimeOff | null>(async (ids) => {
      const found = await requests.readStatuses(context.getActor(), ids);
      return ids.map((id) => found.get(id) ?? null);
    }),
    requests: new DataLoader(async (employeeIds: readonly string[]) => {
      const found = await requests.readRequests(context.getActor(), employeeIds);
      return employeeIds.map((id) => found.get(id) ?? null);
    }),
    deciders: new DataLoader(async (employeeIds: readonly string[]) => {
      const found = await employees.readEmployees(context.getActor(), employeeIds);
      return employeeIds.map((id) => found.get(id) ?? null);
    }),
  }));
  return {
    TimeOffMutations: {
      requestTimeOff: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TimeOffRequestPayload"]>(
          async () => ({
            timeOff: await requests.requestTimeOff(context.getActor(), toBookingInput(input)),
          }),
          ["INVALID_INPUT", "NOT_FOUND", "CONFLICT"],
        ),
    },
    Employee: {
      timeOffRequests: async ({ id }, _args, context) =>
        (await loaders(context).requests.load(id))?.map((request) => ({
          ...request,
          cost: dayCount(request.days),
          bookedAt: request.requestedAt,
        })) ?? null,
    },
    TimeOff: {
      status: async ({ id }, _args, context) => {
        const stored = await loaders(context).statuses.load(id);
        return stored && toEnum(stored.status);
      },
      decision: async ({ id }, _args, context) =>
        (await loaders(context).statuses.load(id))?.decision ?? null,
      // Colleagues see a person's approved time off but not its history: theirs is empty.
      // shortcut: one history query per time off; batch it when a list selects history.
      history: async ({ id }, { first, after }, context) =>
        (await loaders(context).statuses.load(id))
          ? requests.readHistory(context.getActor(), id, { first: first ?? undefined, after })
          : { edges: [], pageInfo: { hasNextPage: false, endCursor: null } },
    },
    TimeOffDecision: {
      decidedBy: ({ decidedByEmployeeId }, _args, context) =>
        decidedByEmployeeId ? loaders(context).deciders.load(decidedByEmployeeId) : null,
    },
  } satisfies Resolvers;
}
