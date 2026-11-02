import type { Resolvers } from "../../../core/graphql";
import type { ImportServices } from "../app";
import { findOwnerCandidate, setupInvitees } from "../domain";
import {
  AGENT_FILE_PROGRESS,
  AI_SOURCES,
  FAILURES,
  IMPORT,
  KINDS,
  READERS,
  SETUP_INVITE_AUDIENCE_INPUTS,
  STATUSES,
} from "./graphqlValues";
import { importCheckResolvers } from "./importCheckResolvers";
import { importEmployeeResolvers } from "./importEmployeeResolvers";
import { importMutationResolvers } from "./importMutationResolvers";
import { importLoaders } from "./loaders";

export function createResolvers(services: ImportServices): Resolvers {
  const loaders = importLoaders(services);
  return {
    Query: {
      import: () => IMPORT,
    },
    Mutation: {
      import: () => ({}),
    },
    ImportMutations: importMutationResolvers(services),
    Import: {
      id: () => "import",
      sources: (_parent, _args, context) => services.reads.listSources(context.getActor()),
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
      setupInvitees: async (_parent, { audience, ownerEmployeeKey, ownerEmail }, context) => {
        const review = await loaders(context).review();
        return setupInvitees(
          review.readyEmployees,
          review.managers,
          SETUP_INVITE_AUDIENCE_INPUTS[audience],
          ownerEmployeeKey ?? null,
          ownerEmail ?? review.ownerEmail,
        );
      },
      ownerCandidate: async (_parent, _args, context) => {
        const { readyEmployees, ownerEmail } = await loaders(context).review();
        return findOwnerCandidate(readyEmployees, ownerEmail);
      },
      readyEmployee: async (_parent, { key }, context) =>
        (await loaders(context).review()).readyEmployees.find((employee) => employee.key === key) ??
        null,
    },
    ImportSource: {
      kind: ({ kind }) => KINDS[kind],
      status: ({ status }) => STATUSES[status],
      readBy: ({ readBy }) => READERS[readBy],
      pickedUpByExternalAgent: ({ pickedUpByExternalAgentAt }) =>
        pickedUpByExternalAgentAt !== null,
      externalAgentProgress: ({ externalAgentProgress }) =>
        externalAgentProgress ? AGENT_FILE_PROGRESS[externalAgentProgress] : null,
      originalReadAllowed: ({ originalReadAllowedAt }) => originalReadAllowedAt !== null,
      originalReadAiSource: ({ originalReadAiSource }) =>
        originalReadAiSource ? AI_SOURCES[originalReadAiSource] : null,
      failure: ({ failure }) => (failure ? FAILURES[failure] : null),
      employeeCount: ({ id }, _args, context) => loaders(context).employeeCount.load(id),
      records: ({ id }, { first, after }, context) =>
        services.reads.listEmployeeRecords(context.getActor(), {
          first: first ?? undefined,
          after,
          sourceId: id,
        }),
    },
    ...importEmployeeResolvers(loaders),
    ImportCheck: importCheckResolvers(loaders),
  };
}
