import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { createSlackApi, createSlackRelay } from "../../integrations/slack";
import { createSlackConnectionService, type SlackConnectionService } from "./app";
import { createResolvers } from "./graphql";
import { slackRouter } from "./http";

export { createSlackConnectionService, type SlackConnectionService, type SlackPerson } from "./app";

/** Where Slack is reached: Broccoli's OAuth relay and Slack's Web API. */
export interface SlackUrls {
  relayUrl: string;
  apiUrl: string;
}

/** The Slack connection service, built once and shared by the Slack module and the modules that read Slack. */
export function createSlack({
  slack,
  ...dependencies
}: Pick<ModuleDependencies, "orm" | "transact" | "logger" | "secretBox"> & {
  slack: SlackUrls;
}): SlackConnectionService {
  return createSlackConnectionService({
    ...dependencies,
    slackAuthorization: createSlackRelay(slack.relayUrl),
    slackApi: createSlackApi(slack.apiUrl),
  });
}

/** The connection to the company's Slack workspace: connecting it and reading it for other modules. */
export function slackModule(slackConnection: SlackConnectionService): ModuleManifest {
  return {
    name: "slack",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(slackConnection),
    router: (resolveSecurity, publicOrigin) =>
      slackRouter(slackConnection, resolveSecurity, publicOrigin),
  };
}
