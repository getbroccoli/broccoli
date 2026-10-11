import { requireSignedIn } from "../../../core/actor";
import type { Resolvers } from "../../../core/graphql";
import type { Company, CompanyUseCases } from "../app";

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
      setName: async (_parent, { name }, { actor }) =>
        toGraphql(await useCases.setName(requireSignedIn(actor), name)),
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
    logoUrl: logoId && `/api/company/logo/${logoId}`,
  };
}
