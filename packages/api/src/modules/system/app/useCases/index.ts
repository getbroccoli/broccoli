import type { CurrentAi } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { chooseAi, type ChooseAiInput } from "./chooseAi";
import { readAi } from "./readAi";
import type { SystemContext } from "./systemContext";

export type { ChooseAiInput } from "./chooseAi";
export type { AiChecks, SystemContext } from "./systemContext";

/** Everything the instance-wide setup does beyond its steps; the adapters call nothing else. */
export interface SystemUseCases {
  /** The source files are read with now; null when managed. */
  readAi: (ctx: SecurityContext) => Promise<CurrentAi | null>;
  /** Checks that the chosen source works, then saves it. */
  chooseAi: (ctx: SecurityContext, input: ChooseAiInput) => Promise<CurrentAi>;
}

export function createSystemUseCases(context: SystemContext): SystemUseCases {
  return {
    readAi: (ctx: SecurityContext) => readAi(context, ctx),
    chooseAi: (ctx: SecurityContext, input: ChooseAiInput) => chooseAi(context, ctx, input),
  };
}
