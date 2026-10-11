import { requireSignedIn } from "../../../core/actor";
import type { Resolvers } from "../../../core/graphql";
import type { EmployeeUseCases } from "../app";

export function createResolvers(useCases: EmployeeUseCases): Resolvers {
  return {
    Query: {
      employees: (_parent, { first, after, orderBy, filter }, { actor }) =>
        useCases.listEmployees(requireSignedIn(actor), {
          first: first ?? undefined,
          after,
          orderBy,
          filter,
        }),
    },
    Mutation: {
      employee: () => ({}),
    },
    EmployeeMutations: {
      create: (_parent, { input }, { actor }) =>
        useCases.createEmployee(requireSignedIn(actor), input),
    },
  };
}
