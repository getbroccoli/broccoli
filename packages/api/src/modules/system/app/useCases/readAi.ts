import {
  selfHostedAiConfig,
  readAiSource,
  type SelfHostedAiConfig,
} from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import type { SystemContext } from "./systemContext";

/** The source files are read with now; null on a managed instance, which keeps its own key. */
export async function readAi(
  { orm, secretBox, mode, ai }: SystemContext,
  ctx: SecurityContext,
): Promise<SelfHostedAiConfig | null> {
  ctx.requireSetupAccess();
  if (mode === "managed") {
    return null;
  }
  return selfHostedAiConfig(await readAiSource(orm, secretBox), ai.environmentKey);
}
