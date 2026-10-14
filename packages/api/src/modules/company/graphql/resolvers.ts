import type { Resolvers } from "../../../core/graphql";
import { requireSignedIn } from "../../../core/security";
import type { Company, CompanyUseCases } from "../app";
import { logoUrl } from "../http";

export function createResolvers(useCases: CompanyUseCases): Resolvers {
  return {
    Query: {
      company: async (_parent, _args, { security }) =>
        toGraphql(await useCases.getCompany(requireSignedIn(security))),
    },
    Mutation: {
      company: () => ({}),
    },
    CompanyMutations: {
      update: async (_parent, { input }, { security }) =>
        toGraphql(await useCases.update(requireSignedIn(security), input)),
      removeLogo: async (_parent, _args, { security }) =>
        toGraphql(await useCases.removeLogo(requireSignedIn(security))),
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
