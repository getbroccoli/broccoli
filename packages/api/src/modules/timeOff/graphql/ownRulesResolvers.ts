import {
  type GraphqlContext,
  mutationPayload,
  type Resolvers,
  type ResolversTypes,
} from "../../../core/graphql";
import type { EmployeeReadService } from "../../employees";
import type { OwnTimeOffRulesService } from "../app";
import { toStoredRules } from "./storedRules";

/** What the own-rules mutations call: the use cases, and the person read back for the payload. */
export interface OwnRulesServices {
  ownRules: OwnTimeOffRulesService;
  employees: Pick<EmployeeReadService, "readEmployee">;
}

/** The time off mutations on a person's own rules, each answering with the person afterwards. */
export function ownRulesResolvers({ ownRules, employees }: OwnRulesServices) {
  const payload = (context: GraphqlContext, employeeId: string, change: () => Promise<void>) =>
    mutationPayload<ResolversTypes["TimeOffOwnRulesPayload"]>(async () => {
      await change();
      return { employee: await employees.readEmployee(context.getActor(), employeeId) };
    }, ["INVALID_INPUT", "NOT_FOUND", "CONFLICT"]);
  return {
    setOwnRules: (_parent, { input }, context) =>
      payload(context, input.employeeId, () =>
        ownRules.setOwnRules(context.getActor(), { ...input, rules: toStoredRules(input.rules) }),
      ),
    useTermsRules: (_parent, { input }, context) =>
      payload(context, input.employeeId, () => ownRules.useTermsRules(context.getActor(), input)),
    cancelOwnRulesChange: (_parent, { input }, context) =>
      payload(context, input.employeeId, () =>
        ownRules.cancelOwnRulesChange(context.getActor(), input),
      ),
  } satisfies Resolvers["TimeOffMutations"];
}
