import type { Mode } from "../../../../core/env";
import type {
  AddApprovedPeople,
  AiSettingsService,
  MailSettingsService,
  PasswordResetEmailService,
} from "../../../../core/instance";
import type { Tx } from "../../../../core/db";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import type { SecurityContext } from "../../../../core/security";

/** What the system use cases work with. */
export interface SystemContext extends Pick<ModuleDependencies, "orm" | "transact" | "logger"> {
  mode: Mode;
  aiSettings: AiSettingsService;
  mailSettings: MailSettingsService;
  /** Its job sends the email of a password reset. */
  passwordResetEmail: Pick<PasswordResetEmailService, "jobs">;
  /** Adds the people the owner approved when managed setup completes. */
  addApprovedPeople: AddApprovedPeople;
  /** Deletes every employee when the owner resets setup. */
  deleteAllEmployees: (ctx: SecurityContext, tx: Tx) => Promise<void>;
  /** Deletes what is left of the approved import when the owner resets setup. */
  deleteFinishedImport: (ctx: SecurityContext, tx: Tx) => Promise<void>;
}
