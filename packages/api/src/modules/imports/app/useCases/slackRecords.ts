import { ApplicationError } from "../../../../core/applicationError";
import type { SlackApi, SlackAuthorization } from "../../../../integrations/slack";
import { type IncomingRecord, mapSlackMembers } from "../../domain";

/** The workspace's members as employee records; rejects when Slack refuses. */
export async function readSlackRecords(
  slackApi: SlackApi,
  accessToken: string,
): Promise<IncomingRecord[]> {
  return mapSlackMembers(await slackApi.listMembers(accessToken));
}

/** The way this server authorizes Slack; refuses when it has none. */
export function requireSlackAuthorization(
  slackAuthorization: SlackAuthorization | null,
): SlackAuthorization {
  if (!slackAuthorization) {
    throw new ApplicationError("UNAVAILABLE", "Slack is not set up on this server.");
  }
  return slackAuthorization;
}
