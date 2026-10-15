import type { Resolvers } from "../../../core/graphql";
import type { ImportUseCases } from "../app";
import { importLoaders } from "./loaders";

const IMPORT = {};
const KINDS = { slack: "SLACK" } as const;

export function createResolvers(useCases: ImportUseCases): Resolvers {
  const loaders = importLoaders(useCases);
  return {
    Query: {
      import: () => IMPORT,
    },
    Mutation: {
      import: () => ({}),
    },
    ImportMutations: {
      readSlack: async (_parent, _args, context) => {
        await useCases.readSlack(context.getActor());
        return IMPORT;
      },
      skip: async (_parent, _args, context) => {
        await useCases.skipImport(context.getActor());
        return IMPORT;
      },
    },
    Import: {
      id: () => "import",
      sources: (_parent, _args, context) => useCases.listSources(context.getActor()),
      employees: (_parent, { first, after }, context) =>
        useCases.listEmployees(context.getActor(), { first: first ?? undefined, after }),
    },
    ImportSource: {
      kind: ({ kind }) => KINDS[kind],
      employeeCount: ({ id }, _args, context) => loaders(context).employeeCount.load(id),
      employees: ({ id }, { first, after }, context) =>
        useCases.listEmployees(context.getActor(), {
          first: first ?? undefined,
          after,
          sourceId: id,
        }),
    },
    ImportEmployee: {
      source: ({ sourceId }, _args, context) => loaders(context).source.load(sourceId),
    },
  };
}
