import type { Mode } from "../../core/env";
import { readSdl } from "../../core/graphql";
import { readAssignment } from "../../core/instance";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { createSlackClient } from "../../integrations/slack";
import { createImportUseCases } from "./app";
import { createResolvers } from "./graphql";
import { type PublicOrigin, slackRouter } from "./http";

export { createImportUseCases, type ImportUseCases } from "./app";
/** For test seeding only; other modules go through the use cases. */
export { importRepository } from "./db";
export type { ImportEmployeeValues } from "./domain";

/** Where Slack is reached: Broccoli's OAuth relay and Slack's Web API. */
export interface SlackUrls {
  relayUrl: string;
  apiUrl: string;
}

/**
 * Bringing people in before they become employees: sources such as the Slack
 * workspace deliver records, which wait in the import for review.
 */
export function importsModule({
  mode,
  publicUrl,
  slack,
  ...dependencies
}: Pick<ModuleDependencies, "orm" | "eventBus" | "logger" | "encryption"> & {
  mode: Mode;
  /** Self-hosted only: the address browsers use; unset takes it from each request. */
  publicUrl?: string;
  slack: SlackUrls;
}): ModuleManifest {
  const useCases = createImportUseCases({ ...dependencies, slack: createSlackClient(slack) });
  const publicOrigin: PublicOrigin = async (request) => {
    if (mode === "managed") {
      // Requests reach a managed instance only after init stored its assignment.
      return (await readAssignment(dependencies.orm))!.publicOrigin;
    }
    return publicUrl ? new URL(publicUrl).origin : `${request.protocol}://${request.host}`;
  };
  return {
    name: "imports",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(useCases),
    router: (resolveActor) => slackRouter(useCases, resolveActor, publicOrigin),
  };
}
