import type { Resolvers } from "../../../core/graphql";
import type { EmployeeUseCases } from "../app";
import type { Employee } from "../domain";
import { avatarUrl } from "../http";

export function createResolvers(useCases: EmployeeUseCases): Resolvers {
  return {
    Query: {
      employees: async (_parent, { first, after, orderBy, filter }, { security }) => {
        const connection = await useCases.listEmployees(security, {
          first: first ?? undefined,
          after,
          orderBy,
          filter,
        });
        return {
          ...connection,
          edges: connection.edges.map((edge) => ({ ...edge, node: toGraphql(edge.node) })),
        };
      },
    },
    Mutation: {
      employee: () => ({}),
    },
    EmployeeMutations: {
      create: async (_parent, { input }, { security }) =>
        toGraphql(await useCases.createEmployee(security, input)),
    },
  };
}

function toGraphql({ avatarFileId, ...employee }: Employee) {
  return { ...employee, avatarUrl: avatarFileId && avatarUrl(avatarFileId) };
}
