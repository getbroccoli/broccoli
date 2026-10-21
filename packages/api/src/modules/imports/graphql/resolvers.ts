import type { Resolvers } from "../../../core/graphql";
import type { ImportUseCases } from "../app";
import { FAILURES, IMPORT, KINDS, READERS, STATUSES } from "./graphqlValues";
import { importCheckResolvers } from "./importCheckResolvers";
import { importEmployeeResolvers } from "./importEmployeeResolvers";
import { importMutationResolvers } from "./importMutationResolvers";
import { importLoaders } from "./loaders";

export function createResolvers(useCases: ImportUseCases): Resolvers {
  const loaders = importLoaders(useCases);
  return {
    Query: {
      import: () => IMPORT,
    },
    Mutation: {
      import: () => ({}),
    },
    ImportMutations: importMutationResolvers(useCases),
    Import: {
      id: () => "import",
      sources: (_parent, _args, context) => useCases.reads.listSources(context.getActor()),
      reading: async (_parent, _args, context) => (await loaders(context).progress()).reading,
      demoAvailable: async (_parent, _args, context) =>
        (await loaders(context).progress()).demoAvailable,
      employees: async (_parent, { first, after, orderBy, filter }, context) =>
        (await loaders(context).review()).listEmployees({
          first: first ?? undefined,
          after,
          orderBy,
          filter,
        }),
      employeeCount: async (_parent, _args, context) =>
        (await loaders(context).review()).employeeCount,
      readyEmployeeCount: async (_parent, _args, context) =>
        (await loaders(context).review()).readyEmployees.length,
      readyEmployeeSources: async (_parent, _args, context) =>
        (await loaders(context).review()).readyEmployeeSources,
      checks: async (_parent, _args, context) => (await loaders(context).review()).checks,
      version: async (_parent, _args, context) => (await loaders(context).review()).version,
      latestReviewChange: async (_parent, _args, context) =>
        (await loaders(context).review()).latestReviewChange,
    },
    ImportSource: {
      kind: ({ kind }) => KINDS[kind],
      status: ({ status }) => STATUSES[status],
      readBy: ({ readBy }) => READERS[readBy],
      pickedUpByExternalAgent: ({ pickedUpByExternalAgentAt }) =>
        pickedUpByExternalAgentAt !== null,
      originalReadAllowed: ({ originalReadAllowedAt }) => originalReadAllowedAt !== null,
      failure: ({ failure }) => (failure ? FAILURES[failure] : null),
      employeeCount: ({ id }, _args, context) => loaders(context).employeeCount.load(id),
      records: ({ id }, { first, after }, context) =>
        useCases.reads.listEmployeeRecords(context.getActor(), {
          first: first ?? undefined,
          after,
          sourceId: id,
        }),
    },
    ...importEmployeeResolvers(loaders),
    ImportCheck: importCheckResolvers(loaders),
  };
}
