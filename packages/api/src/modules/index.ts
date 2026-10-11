import type { ModuleDependencies, ModuleManifest } from "../core/moduleManifest";
import { companyModule } from "./company";
import { employeesModule } from "./employees";
import { systemModule } from "./system";

/** Settings that only some modules need, read from the environment by `main.ts`. */
export interface ModuleSettings {
  brandLookupUrl: string | null;
}

/** Every module of the API, each given only the dependencies it uses. */
export function createModules(
  core: ModuleDependencies,
  { brandLookupUrl }: ModuleSettings,
): ModuleManifest[] {
  return [
    systemModule({ orm: core.orm }),
    employeesModule({ orm: core.orm }),
    companyModule({ ...core, brandLookupUrl }),
  ];
}
