import type { AiConfig } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import type { SystemContext } from "./systemContext";

/** The AI files are read with now; null on a managed instance, which never sees the choice. */
export async function readAi(
  { mode, aiSettings }: Pick<SystemContext, "mode" | "aiSettings">,
  ctx: SecurityContext,
): Promise<AiConfig | null> {
  ctx.requireSetupAccess();
  if (mode === "managed") {
    return null;
  }
  return aiSettings.read();
}
