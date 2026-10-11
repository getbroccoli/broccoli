import { requireSignedIn } from "../../../core/actor";
import type { Resolvers } from "../../../core/graphql";
import type { Company, CompanyUseCases } from "../app";
import { logoUrl } from "../http";

export function createResolvers(useCases: CompanyUseCases): Resolvers {
  return {
    Query: {
      company: async (_parent, _args, { actor }) =>
        toGraphql(await useCases.getCompany(requireSignedIn(actor))),
    },
    Mutation: {
      company: () => ({}),
    },
    CompanyMutations: {
      update: async (_parent, { input }, { actor }) =>
        toGraphql(await useCases.update(requireSignedIn(actor), input)),
      removeLogo: async (_parent, _args, { actor }) =>
        toGraphql(await useCases.removeLogo(requireSignedIn(actor))),
    },
  };
}

function toGraphql({ name, suggestedName, logoId }: Company) {
  return {
    id: "company",
    name,
    suggestedName,
    logoUrl: logoId && logoUrl(logoId),
  };
}
