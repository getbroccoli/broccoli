import type { ModuleDependencies, ModuleManifest } from "../core/module-manifest";
import { employeesModule } from "./employees";
import { system } from "./system";

/** Every module of the API; the core builds the API from this list. */
export function createModules(dependencies: ModuleDependencies): ModuleManifest[] {
  return [system, employeesModule(dependencies)];
}
