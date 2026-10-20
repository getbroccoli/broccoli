import type { Mode } from "../../../../core/env";
import type { AiSettings } from "../../../../core/instance";
import type { ModuleDependencies } from "../../../../core/moduleManifest";

/** What the system use cases work with. */
export interface SystemContext extends Pick<ModuleDependencies, "orm" | "transact"> {
  mode: Mode;
  aiSettings: AiSettings;
}
