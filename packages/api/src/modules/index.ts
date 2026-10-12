import type { Mode } from "../core/env";
import type { ModuleDependencies, ModuleManifest } from "../core/moduleManifest";
import { companyModule } from "./company";
import { employeesModule } from "./employees";
import { systemModule } from "./system";

/** Settings that only some modules need, read from the environment by `main.ts`. */
export interface ModuleSettings {
  mode: Mode;
  brandLookupUrl: string | null;
}

/** Every module of the API, each given only the dependencies it uses. */
export function createModules(
  core: ModuleDependencies,
  { mode, brandLookupUrl }: ModuleSettings,
): ModuleManifest[] {
  return [
    systemModule({ orm: core.orm, mode }),
    employeesModule({ orm: core.orm }),
    companyModule({ ...core, brandLookupUrl }),
  ];
}
