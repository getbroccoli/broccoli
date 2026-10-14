import type { Mode } from "../../core/env";
import { readSdl } from "../../core/graphql";
import { readAssignment } from "../../core/instance";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { createSlackApi, createSlackRelay } from "../../integrations/slack";
import { createSlackConnectionService, type SlackConnectionService } from "./app";
import { createResolvers } from "./graphql";
import { type PublicOrigin, slackRouter } from "./http";

export {
  createSlackConnectionService,
  type SlackMembersRead,
  type SlackConnectionService,
} from "./app";
export type { SlackMember } from "../../integrations/slack";
/** For test seeding only; other modules go through the use cases. */
export { slackConnectionRepository } from "./db";

/** Where Slack is reached: Broccoli's OAuth relay and Slack's Web API. */
export interface SlackUrls {
  relayUrl: string;
  apiUrl: string;
}

/** The Slack connection service, built once and shared by the Slack module and the modules that read Slack. */
export function createSlack({
  slack,
  ...dependencies
}: Pick<ModuleDependencies, "orm" | "eventBus" | "logger" | "encryption"> & {
  slack: SlackUrls;
}): SlackConnectionService {
  return createSlackConnectionService({
    ...dependencies,
    slackAuthorization: createSlackRelay(slack.relayUrl),
    slackApi: createSlackApi(slack.apiUrl),
  });
}

/** The connection to the company's Slack workspace: connecting it and reading it for other modules. */
export function slackModule({
  slackConnection,
  orm,
  mode,
  publicUrl,
}: Pick<ModuleDependencies, "orm"> & {
  slackConnection: SlackConnectionService;
  mode: Mode;
  /** Self-hosted only: the address browsers use; unset takes it from each request. */
  publicUrl?: string;
}): ModuleManifest {
  const publicOrigin: PublicOrigin = async (request) => {
    if (mode === "managed") {
      // Requests reach a managed instance only after init stored its assignment.
      return (await readAssignment(orm))!.publicOrigin;
    }
    return publicUrl ? new URL(publicUrl).origin : `${request.protocol}://${request.host}`;
  };
  return {
    name: "slack",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(slackConnection),
    router: (resolveSecurity) => slackRouter(slackConnection, resolveSecurity, publicOrigin),
  };
}
