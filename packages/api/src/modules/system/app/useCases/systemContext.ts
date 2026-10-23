import type { Mode } from "../../../../core/env";
import type { AddApprovedPeople, AiSettings } from "../../../../core/instance";
import type { Tx } from "../../../../core/db";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import type { SecurityContext } from "../../../../core/security";

/** What the system use cases work with. */
export interface SystemContext extends Pick<ModuleDependencies, "orm" | "transact" | "logger"> {
  mode: Mode;
  aiSettings: AiSettings;
  /** Adds the people the owner approved when managed setup completes. */
  addApprovedPeople: AddApprovedPeople;
  /** Deletes every employee when the owner resets setup. */
  deleteAllEmployees: (ctx: SecurityContext, tx: Tx) => Promise<void>;
}
