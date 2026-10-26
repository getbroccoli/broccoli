import type { AiSettings, MailSettings } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { completeSetup } from "./completeSetup";
import { resetSetup } from "./resetSetup";
import type { SystemContext } from "./systemContext";

export type { SystemContext } from "./systemContext";

/** Everything the instance-wide setup does beyond its steps; the adapters call nothing else. */
export interface SystemUseCases {
  /** The AI files are read with, and the owner's choice of it. */
  ai: Pick<AiSettings, "read" | "save">;
  /** How the instance sends email, and the owner's test email. */
  mail: Pick<MailSettings, "read" | "save" | "sendTestEmail">;
  /** Completes setup from the ready step. */
  completeSetup: (ctx: SecurityContext) => Promise<void>;
  /** Starts a finished setup over from the company step. */
  resetSetup: (ctx: SecurityContext) => Promise<void>;
}

export function createSystemUseCases(context: SystemContext): SystemUseCases {
  return {
    ai: context.aiSettings,
    mail: context.mailSettings,
    completeSetup: (ctx: SecurityContext) => completeSetup(context, ctx),
    resetSetup: (ctx: SecurityContext) => resetSetup(context, ctx),
  };
}
