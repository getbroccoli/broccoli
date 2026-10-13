import type { SlackClient } from "../../../../integrations/slack";
import { type IncomingRecord, mapSlackMembers } from "../../domain";

/** The workspace's members as employee records; rejects when Slack refuses. */
export async function readSlackRecords(
  slack: SlackClient,
  accessToken: string,
): Promise<IncomingRecord[]> {
  return mapSlackMembers(await slack.listMembers(accessToken));
}
