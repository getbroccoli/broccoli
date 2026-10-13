import type { Resolvers } from "../../../core/graphql";
import type { Company, CompanyUseCases } from "../app";
import { logoUrl } from "../http";

export function createResolvers(useCases: CompanyUseCases): Resolvers {
  return {
    Query: {
      company: async (_parent, _args, { actor }) => toGraphql(await useCases.getCompany(actor)),
    },
    Mutation: {
      company: () => ({}),
    },
    CompanyMutations: {
      update: async (_parent, { input }, { actor }) =>
        toGraphql(await useCases.update(actor, input)),
      removeLogo: async (_parent, _args, { actor }) => toGraphql(await useCases.removeLogo(actor)),
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
