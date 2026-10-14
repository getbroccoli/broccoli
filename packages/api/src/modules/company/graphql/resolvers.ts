import type { Resolvers } from "../../../core/graphql";
import type { Company, CompanyUseCases } from "../app";
import { logoUrl } from "../http";

export function createResolvers(useCases: CompanyUseCases): Resolvers {
  return {
    Query: {
      company: async (_parent, _args, { security }) =>
        toGraphql(await useCases.getCompany(security)),
    },
    Mutation: {
      company: () => ({}),
    },
    CompanyMutations: {
      update: async (_parent, { input }, { security }) =>
        toGraphql(await useCases.update(security, input)),
      removeLogo: async (_parent, _args, { security }) =>
        toGraphql(await useCases.removeLogo(security)),
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
