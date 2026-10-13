import type { SlackApi } from "../../../../integrations/slack";
import { type IncomingRecord, mapSlackMembers } from "../../domain";

/** The workspace's members as employee records; rejects when Slack refuses. */
export async function readSlackRecords(
  slackApi: SlackApi,
  accessToken: string,
): Promise<IncomingRecord[]> {
  return mapSlackMembers(await slackApi.listMembers(accessToken));
}
