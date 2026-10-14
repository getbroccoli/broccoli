import type { Resolvers } from "../../../core/graphql";
import type { Company, CompanyUseCases } from "../app";
import { logoUrl } from "../http";

export function createResolvers(useCases: CompanyUseCases): Resolvers {
  return {
    Query: {
      company: async (_parent, _args, context) =>
        toGraphql(await useCases.getCompany(context.requireSignedIn())),
    },
    Mutation: {
      company: () => ({}),
    },
    CompanyMutations: {
      update: async (_parent, { input }, context) =>
        toGraphql(await useCases.update(context.requireSignedIn(), input)),
      removeLogo: async (_parent, _args, context) =>
        toGraphql(await useCases.removeLogo(context.requireSignedIn())),
    },
  };
}

function toGraphql({ name, suggestedName, logoFileId }: Company) {
  return {
    id: "company",
    name,
    suggestedName,
    logoUrl: logoFileId && logoUrl(logoFileId),
  };
}
