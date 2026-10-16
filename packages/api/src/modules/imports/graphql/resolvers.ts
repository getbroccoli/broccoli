import { mutationPayload, type Resolvers, type ResolversTypes } from "../../../core/graphql";
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
      readSlack: (_parent, _args, context) =>
        mutationPayload<ResolversTypes["ImportReadSlackPayload"]>(
          "import",
          () => thenImport(useCases.readSlack(context.getActor())),
          ["UNAVAILABLE"],
        ),
      skip: (_parent, _args, context) =>
        mutationPayload<ResolversTypes["ImportPayload"]>("import", () =>
          thenImport(useCases.skipImport(context.getActor())),
        ),
      approve: (_parent, _args, context) =>
        mutationPayload<ResolversTypes["ImportApprovePayload"]>(
          "import",
          () => thenImport(useCases.approveImport(context.getActor())),
          ["CONFLICT"],
        ),
      retryFile: (_parent, { sourceId }, context) =>
        mutationPayload<ResolversTypes["ImportRetryFilePayload"]>(
          "import",
          () => thenImport(useCases.files.retryFile(context.getActor(), sourceId)),
          ["CONFLICT"],
        ),
      removeFile: (_parent, { sourceId }, context) =>
        mutationPayload<ResolversTypes["ImportPayload"]>("import", () =>
          thenImport(useCases.files.removeFile(context.getActor(), sourceId)),
        ),
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

/** The import, once a use case that returns nothing has finished; its fields load what the client selects. */
async function thenImport(work: Promise<void>): Promise<typeof IMPORT> {
  await work;
  return IMPORT;
}
