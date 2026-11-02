import type { Mode } from "../../core/env";
import { readSdl } from "../../core/graphql";
import type {
  AiSettingsService,
  MailSettingsService,
  PasswordResetEmailService,
} from "../../core/instance";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { createSystemService, type SystemServiceDependencies } from "./app";
import { createResolvers } from "./graphql";

// Public values.
export { createSystemService } from "./app";
export { readSetupView } from "./graphql";

/** What the system module works with. */
export interface SystemDependencies
  extends Pick<ModuleDependencies, "orm">, SystemServiceDependencies {
  mode: Mode;
  aiSettings: AiSettingsService;
  mailSettings: MailSettingsService;
  /** Its job sends the email of a password reset. */
  passwordResetEmail: Pick<PasswordResetEmailService, "jobs">;
}

/** Platform-level API fields that belong to no business module: setup, the user, AI and mail. */
export function systemModule(dependencies: SystemDependencies): ModuleManifest {
  return {
    name: "system",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(dependencies, createSystemService(dependencies)),
    jobs: dependencies.passwordResetEmail.jobs,
  };
}
