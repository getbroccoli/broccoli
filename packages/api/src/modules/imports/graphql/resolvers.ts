import type { Resolvers } from "../../../core/graphql";
import { incompleteReason, type ImportUseCases } from "../app";
import { importLoaders } from "./loaders";

const IMPORT = {};
const KINDS = { slack: "SLACK", file: "FILE" } as const;
const STATUSES = { mapping: "MAPPING", mapped: "MAPPED", failed: "FAILED" } as const;
const FAILURES = {
  no_people_columns: "NO_PEOPLE_COLUMNS",
  unavailable: "UNAVAILABLE",
} as const;
const INCOMPLETE_REASONS = {
  firstName: "FIRST_NAME",
  lastName: "LAST_NAME",
  email: "EMAIL",
  other: "OTHER",
} as const;

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
      approve: async (_parent, _args, context) => {
        await useCases.approveImport(context.getActor());
        return IMPORT;
      },
      retryFile: async (_parent, { sourceId }, context) => {
        await useCases.files.retryFile(context.getActor(), sourceId);
        return IMPORT;
      },
      removeFile: async (_parent, { sourceId }, context) => {
        await useCases.files.removeFile(context.getActor(), sourceId);
        return IMPORT;
      },
    },
    Import: {
      id: () => "import",
      sources: (_parent, _args, context) => useCases.reads.listSources(context.getActor()),
      employees: (_parent, { first, after, orderBy, filter }, context) =>
        useCases.reads.listEmployees(context.getActor(), {
          first: first ?? undefined,
          after,
          orderBy,
          filter,
        }),
      readyEmployeeCount: (_parent, _args, context) =>
        useCases.reads.readyEmployeeCount(context.getActor()),
      canReadFiles: (_parent, _args, context) => useCases.files.canReadFiles(context.getActor()),
    },
    ImportSource: {
      kind: ({ kind }) => KINDS[kind],
      status: ({ status }) => STATUSES[status],
      failure: ({ failure }) => (failure ? FAILURES[failure] : null),
      employeeCount: ({ id }, _args, context) => loaders(context).employeeCount.load(id),
      employees: ({ id }, { first, after, orderBy, filter }, context) =>
        useCases.reads.listEmployees(context.getActor(), {
          first: first ?? undefined,
          after,
          orderBy,
          filter,
          sourceId: id,
        }),
    },
    ImportEmployee: {
      source: ({ sourceId }, _args, context) => loaders(context).source.load(sourceId),
      incompleteReason: (record) => {
        const reason = incompleteReason(record);
        return reason ? INCOMPLETE_REASONS[reason] : null;
      },
    },
  };
}
