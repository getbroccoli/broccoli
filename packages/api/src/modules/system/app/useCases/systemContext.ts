import type { Mode } from "../../../../core/env";
import type { AddApprovedPeople, AiSettings } from "../../../../core/instance";
import type { ModuleDependencies } from "../../../../core/moduleManifest";

/** What the system use cases work with. */
export interface SystemContext extends Pick<ModuleDependencies, "orm" | "transact"> {
  mode: Mode;
  aiSettings: AiSettings;
  /** Adds the people the owner approved when managed setup completes. */
  addApprovedPeople: AddApprovedPeople;
}
