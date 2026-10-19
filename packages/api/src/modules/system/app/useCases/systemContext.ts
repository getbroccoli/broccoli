import type { Mode } from "../../../../core/env";
import type { ModuleDependencies } from "../../../../core/moduleManifest";

/** What the system use cases work with. */
export interface SystemContext extends Pick<ModuleDependencies, "orm" | "transact" | "secretBox"> {
  mode: Mode;
  ai: AiChecks;
}

/** The instance's AI sources, as `createModules` wires them. */
export interface AiChecks {
  /** `OPENROUTER_API_KEY`, or null. */
  environmentKey: string | null;
  /** Throws a `DecisionsError`, not retryable when OpenRouter refuses the key. */
  checkOpenRouterKey(key: string): Promise<void>;
  /** Makes sure the install holds a Broccoli AI token; throws a `DecisionsError` when refused. */
  prepareBroccoliAi(): Promise<void>;
}
