import type { Resolvers } from "../../../core/graphql";
import type { EmployeeUseCases } from "../app";

export function createResolvers(useCases: EmployeeUseCases): Resolvers {
  return {
    Query: {
      employees: (_parent, { first, after }, { actor }) =>
        useCases.listEmployees(actor, { first: first ?? undefined, after }),
    },
    Mutation: {
      employee: () => ({}),
    },
    EmployeeMutations: {
      create: (_parent, { input }, { actor }) => useCases.createEmployee(actor, input),
    },
  };
}
