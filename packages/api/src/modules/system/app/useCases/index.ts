import type { AiSettings } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { completeSetup } from "./completeSetup";
import type { SystemContext } from "./systemContext";

export type { SystemContext } from "./systemContext";

/** Everything the instance-wide setup does beyond its steps; the adapters call nothing else. */
export interface SystemUseCases {
  /** The AI files are read with, and the owner's choice of it. */
  ai: Pick<AiSettings, "read" | "save">;
  /** Completes setup from the ready step. */
  completeSetup: (ctx: SecurityContext) => Promise<void>;
}

export function createSystemUseCases(context: SystemContext): SystemUseCases {
  return {
    ai: context.aiSettings,
    completeSetup: (ctx: SecurityContext) => completeSetup(context, ctx),
  };
}
