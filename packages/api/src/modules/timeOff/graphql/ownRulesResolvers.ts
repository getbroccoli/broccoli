import {
  type GraphqlContext,
  mutationPayload,
  type Resolvers,
  type ResolversTypes,
} from "../../../core/graphql";
import type { EmployeeReadService } from "../../employees";
import type { TimeOffPolicyService } from "../app";
import { toStoredRules } from "./storedRules";

/** The time off mutations on a person's own rules, each answering with the person afterwards. */
export function ownRulesResolvers(
  policies: TimeOffPolicyService,
  employees: Pick<EmployeeReadService, "readEmployee">,
) {
  const payload = (context: GraphqlContext, employeeId: string, change: () => Promise<void>) =>
    mutationPayload<ResolversTypes["TimeOffOwnRulesPayload"]>(async () => {
      await change();
      return { employee: await employees.readEmployee(context.getActor(), employeeId) };
    }, ["INVALID_INPUT", "NOT_FOUND", "CONFLICT"]);
  return {
    setOwnRules: (_parent, { input }, context) =>
      payload(context, input.employeeId, () =>
        policies.setOwnRules(context.getActor(), { ...input, rules: toStoredRules(input.rules) }),
      ),
    useTermsRules: (_parent, { input }, context) =>
      payload(context, input.employeeId, () => policies.useTermsRules(context.getActor(), input)),
    cancelOwnRulesChange: (_parent, { input }, context) =>
      payload(context, input.employeeId, () =>
        policies.cancelOwnRulesChange(context.getActor(), input),
      ),
  } satisfies Resolvers["TimeOffMutations"];
}
