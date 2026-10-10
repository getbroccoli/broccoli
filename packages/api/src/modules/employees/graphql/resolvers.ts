import type { Actor } from "../../../core/actor";
import type { Resolvers } from "../../../core/graphql";
import type { EmployeeConnection } from "../app";
import type { Employee, NewEmployeeInput } from "../domain";

export interface EmployeeUseCases {
  createEmployee(actor: Actor | null, input: NewEmployeeInput): Promise<Employee>;
  listEmployees(
    actor: Actor | null,
    page: { first?: number; after?: string | null },
  ): Promise<EmployeeConnection>;
}

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
