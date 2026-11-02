import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { PrincipalSecurityContext } from "../../core/security";
import { createCompanyService, type CompanyService } from "./app";
import { createBrandLookup } from "../../integrations/brandLookup";
import { createResolvers } from "./graphql";
import { logoRouter } from "./http";

// Public values.
export { createCompanyService } from "./app";

// Public types.

/** The company service, built once and shared by the company module and the invites that name the company. */
export function createCompany({
  brandLookupUrl,
  ...dependencies
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  brandLookupUrl: string | null;
}): CompanyService {
  return createCompanyService({ ...dependencies, brandLookup: createBrandLookup(brandLookupUrl) });
}

/** The company the instance belongs to: its name, suggested during setup, and its logo. */
export function companyModule(company: CompanyService): ModuleManifest {
  return {
    name: "company",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(company),
    events: {
      "instance.owner_claimed": (owner) =>
        company.detectCompanyNameAndLogo(PrincipalSecurityContext.system(), owner),
    },
    router: (resolveSecurity) => logoRouter(company, resolveSecurity),
  };
}
