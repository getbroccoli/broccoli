import { mutationPayload, type Resolvers, type ResolversTypes } from "../../../core/graphql";
import type { Company, CompanyService } from "../app";
import { logoUrl } from "../http";

export function createResolvers(company: CompanyService): Resolvers {
  return {
    Query: {
      company: async (_parent, _args, context) =>
        toGraphql(await company.getCompany(context.getActor())),
    },
    Mutation: {
      company: () => ({}),
    },
    CompanyMutations: {
      update: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["CompanyUpdatePayload"]>(
          async () => ({ company: toGraphql(await company.update(context.getActor(), input)) }),
          ["INVALID_INPUT"],
        ),
      removeLogo: (_parent, _args, context) =>
        mutationPayload<ResolversTypes["CompanyMutationPayload"]>(async () => ({
          company: toGraphql(await company.removeLogo(context.getActor())),
        })),
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
