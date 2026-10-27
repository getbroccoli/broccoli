import { mutationPayload, type Resolvers, type ResolversTypes } from "../../../core/graphql";
import type { EmployeeUseCases } from "../app";
import { avatarUrl } from "../http";
import { employeeLoaders } from "./loaders";

export function createResolvers(useCases: EmployeeUseCases): Resolvers {
  const loaders = employeeLoaders(useCases);
  return {
    Query: {
      employee: (_parent, { id }, context) => useCases.readEmployee(context.getActor(), id),
      employees: (_parent, { first, after, orderBy, filter }, context) =>
        useCases.listEmployees(context.getActor(), {
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
      create: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["EmployeeCreatePayload"]>(
          async () => ({ employee: await useCases.createEmployee(context.getActor(), input) }),
          ["INVALID_INPUT"],
        ),
      update: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["EmployeeUpdatePayload"]>(
          () => useCases.updateEmployee(context.getActor(), input),
          ["INVALID_INPUT", "NOT_FOUND"],
        ),
      delete: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["EmployeeDeletePayload"]>(
          async () => ({
            deletedEmployeeId: await useCases.deleteEmployee(context.getActor(), input),
          }),
          ["INVALID_INPUT", "NOT_FOUND"],
        ),
    },
    Employee: {
      avatarUrl: ({ avatarFileId }) => avatarFileId && avatarUrl(avatarFileId),
      managerId: async (employee, _args, context) =>
        (await loaders(context).manager.load(employee.id))?.id ?? null,
      manager: (employee, _args, context) => loaders(context).manager.load(employee.id),
      // shortcut: one query per employee; batch it when a list selects history.
      history: (employee, { first, after }, context) =>
        useCases.readEmployeeHistory(context.getActor(), employee.id, {
          first: first ?? undefined,
          after,
        }),
    },
  };
}
