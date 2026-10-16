import { mutationPayload, type Resolvers } from "../../../core/graphql";
import type { Company, CompanyUseCases } from "../app";
import { logoUrl } from "../http";

export function createResolvers(useCases: CompanyUseCases): Resolvers {
  return {
    Query: {
      company: async (_parent, _args, context) =>
        toGraphql(await useCases.getCompany(context.getActor())),
    },
    Mutation: {
      company: () => ({}),
    },
    CompanyMutations: {
      update: (_parent, { input }, context) =>
        mutationPayload(
          "company",
          async () => toGraphql(await useCases.update(context.getActor(), input)),
          ["INVALID_INPUT"],
        ),
      removeLogo: (_parent, _args, context) =>
        mutationPayload("company", async () =>
          toGraphql(await useCases.removeLogo(context.getActor())),
        ),
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
