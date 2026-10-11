import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/module-manifest";
import { createCompanyUseCases } from "./app";
import { createBrandLookup } from "./brand-lookup";
import { createResolvers } from "./graphql";
import { logoRouter } from "./http";

export { createCompanyUseCases, type Company, type CompanyUseCases } from "./app";
export { createBrandLookup, type Brand, type BrandLookup } from "./brand-lookup";
export type { Logo } from "./domain";

/** The company the instance belongs to: its name, suggested during setup, and its logo. */
export function companyModule({
  brandLookupUrl,
  ...dependencies
}: Pick<ModuleDependencies, "orm" | "eventBus" | "logger"> & {
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
    events: { "instance.owner_claimed": useCases.detectCompanyNameAndLogo },
    router: (resolveActor) => logoRouter(useCases, resolveActor),
  };
}
