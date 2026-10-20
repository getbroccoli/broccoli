import type { AiConfig } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { completeSetup } from "./completeSetup";
import { saveAiSource, type AiSourceInput } from "./saveAiSource";
import { readAi } from "./readAi";
import type { SystemContext } from "./systemContext";

export type { SystemContext } from "./systemContext";

/** Everything the instance-wide setup does beyond its steps; the adapters call nothing else. */
export interface SystemUseCases {
  /** The source files are read with now; null when managed. */
  readAi: (ctx: SecurityContext) => Promise<AiConfig | null>;
  /** Checks that the chosen source works, then saves it. */
  saveAiSource: (ctx: SecurityContext, input: AiSourceInput) => Promise<AiConfig>;
  /** Completes setup from the ready step. */
  completeSetup: (ctx: SecurityContext) => Promise<void>;
}

export function createSystemUseCases(context: SystemContext): SystemUseCases {
  return {
    readAi: (ctx: SecurityContext) => readAi(context, ctx),
    saveAiSource: (ctx: SecurityContext, input: AiSourceInput) => saveAiSource(context, ctx, input),
    completeSetup: (ctx: SecurityContext) => completeSetup(context, ctx),
  };
}
