import { perRequest, type Resolvers } from "../../../core/graphql";
import type { ImportUseCases } from "../app";
import { FAILURES, IMPORT, KINDS, READERS, STATUSES } from "./graphqlValues";
import { importCheckResolvers } from "./importCheckResolvers";
import { importEmployeeResolvers } from "./importEmployeeResolvers";
import { importMutationResolvers } from "./importMutationResolvers";
import { importLoaders } from "./loaders";

export function createResolvers(useCases: ImportUseCases): Resolvers {
  const loaders = importLoaders(useCases);
  // One snapshot per request, so the employees review lists and the version it approves agree.
  const snapshotOf = perRequest((context) => ({
    read: useCases.reads.readSnapshot(context.getActor()),
  }));
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
      employees: async (_parent, { first, after, orderBy, filter }, context) =>
        useCases.reads.listEmployees(
          context.getActor(),
          { first: first ?? undefined, after, orderBy, filter },
          await snapshotOf(context).read,
        ),
      employeeCount: (_parent, _args, context) => useCases.reads.employeeCount(context.getActor()),
      readyEmployeeCount: (_parent, _args, context) =>
        useCases.reads.readyEmployeeCount(context.getActor()),
      readyEmployeeSources: (_parent, _args, context) =>
        useCases.reads.listReadyEmployeeSources(context.getActor()),
      checks: (_parent, _args, context) => useCases.reads.listChecks(context.getActor()),
      version: async (_parent, _args, context) => (await snapshotOf(context).read).version,
    },
    ImportSource: {
      kind: ({ kind }) => KINDS[kind],
      status: ({ status }) => STATUSES[status],
      readBy: ({ readBy }) => READERS[readBy],
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
