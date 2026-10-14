import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { PrincipalSecurityContext } from "../../core/security";
import { createCompanyUseCases } from "./app";
import { createBrandLookup } from "../../integrations/brandLookup";
import { createResolvers } from "./graphql";
import { logoRouter } from "./http";

export { createCompanyUseCases, type Company, type CompanyUseCases } from "./app";

/** The company the instance belongs to: its name, suggested during setup, and its logo. */
export function companyModule({
  brandLookupUrl,
  ...dependencies
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  brandLookupUrl: string | null;
}): ModuleManifest {
  const useCases = createCompanyUseCases({
    ...dependencies,
    brandLookup: createBrandLookup(brandLookupUrl),
  });
  return {
    name: "company",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(useCases),
    events: {
      "instance.owner_claimed": (owner) =>
        useCases.detectCompanyNameAndLogo(PrincipalSecurityContext.system(), owner),
    },
    router: (resolveSecurity) => logoRouter(useCases, resolveSecurity, dependencies.orm),
  };
}
