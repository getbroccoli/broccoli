import type { Mode } from "../core/env";
import type { ModuleDependencies, ModuleManifest } from "../core/moduleManifest";
import { companyModule } from "./company";
import { demoModule } from "./demo";
import { employeesModule } from "./employees";
import { importsModule, type SlackUrls } from "./imports";
import { systemModule } from "./system";

/** Settings that only some modules need, read from the environment by `main.ts`. */
export interface ModuleSettings {
  mode: Mode;
  /** Self-hosted only: the address browsers use. */
  publicUrl?: string;
  brandLookupUrl: string | null;
  slack: SlackUrls;
}

/** Every module of the API, each given only the dependencies it uses. */
export function createModules(
  core: ModuleDependencies,
  { mode, publicUrl, brandLookupUrl, slack }: ModuleSettings,
): ModuleManifest[] {
  return [
    systemModule({ orm: core.orm, mode }),
    employeesModule({ orm: core.orm }),
    companyModule({ ...core, brandLookupUrl }),
    demoModule({ orm: core.orm, eventBus: core.eventBus }),
    importsModule({ ...core, mode, publicUrl, slack }),
  ];
}
