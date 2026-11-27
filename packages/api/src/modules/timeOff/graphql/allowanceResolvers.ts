import DataLoader from "dataloader";

import {
  mutationPayload,
  perRequest,
  type Resolvers,
  type ResolversTypes,
  toEnum,
} from "../../../core/graphql";
import type { AllowanceService } from "../app";
import type { AllowanceChange } from "../domain";
import { toGraphqlTimeOffTypeRow } from "./graphqlValues";

/** A balance's history and adjusting it; merged into the module's resolvers. */
export function allowanceResolvers(allowances: AllowanceService) {
  const loaders = perRequest((context) => ({
    history: new DataLoader<string, AllowanceChange[] | null>(async (allowanceIds) => {
      const read = await allowances.readAllowanceHistory(context.getActor(), { allowanceIds });
      return allowanceIds.map((id) => read.get(id) ?? null);
    }),
  }));
  return {
    TimeOffMutations: {
      adjustAllowance: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["AllowanceAdjustPayload"]>(
          async () => ({
            employeeTimeOffType: toGraphqlTimeOffTypeRow(
              await allowances.adjustAllowance(context.getActor(), input),
            ),
          }),
          ["INVALID_INPUT", "CONFLICT", "NOT_FOUND"],
        ),
      reverseAllowanceAdjustment: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["AllowanceAdjustPayload"]>(
          async () => ({
            employeeTimeOffType: toGraphqlTimeOffTypeRow(
              await allowances.reverseAdjustment(context.getActor(), input),
            ),
          }),
          ["INVALID_INPUT", "CONFLICT", "NOT_FOUND"],
        ),
    },
    EmployeeTimeOffType: {
      // Only a balance from an allowance has an allowance id on its card.
      history: ({ allowanceId }, _args, context) =>
        allowanceId ? loaders(context).history.load(allowanceId) : null,
    },
    AllowanceChange: {
      cause: ({ cause }) => toEnum(cause),
      firstBookedDay: ({ bookedDays }) => bookedDays?.first ?? null,
      lastBookedDay: ({ bookedDays }) => bookedDays?.last ?? null,
      parts: ({ parts }) => parts.map(({ kind, amount }) => ({ kind: toEnum(kind), amount })),
    },
  } satisfies Resolvers;
}
