import type { SelfHostedAiConfig } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { chooseAiSource, type AiSourceInput } from "./chooseAiSource";
import { readAi } from "./readAi";
import type { SystemContext } from "./systemContext";

export type { SystemContext } from "./systemContext";

/** Everything the instance-wide setup does beyond its steps; the adapters call nothing else. */
export interface SystemUseCases {
  /** The source files are read with now; null when managed. */
  readAi: (ctx: SecurityContext) => Promise<SelfHostedAiConfig | null>;
  /** Checks that the chosen source works, then saves it. */
  chooseAiSource: (ctx: SecurityContext, input: AiSourceInput) => Promise<SelfHostedAiConfig>;
}

export function createSystemUseCases(context: SystemContext): SystemUseCases {
  return {
    readAi: (ctx: SecurityContext) => readAi(context, ctx),
    chooseAiSource: (ctx: SecurityContext, input: AiSourceInput) =>
      chooseAiSource(context, ctx, input),
  };
}
