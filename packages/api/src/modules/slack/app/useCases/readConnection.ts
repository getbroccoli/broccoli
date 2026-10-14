import type { SecurityContext } from "../../../../core/security";
import { ApplicationError } from "../../../../core/applicationError";
import type { Tx } from "../../../../core/db";
import type { SlackMember } from "../../../../integrations/slack";
import { slackConnectionRepository } from "../../db";
import type { SlackContext } from "./slackContext";

/** The connected workspace, or null. */
export async function getSlackConnection(
  { connections }: SlackContext,
  ctx: SecurityContext,
): Promise<{ teamId: string; teamName: string } | null> {
  ctx.requireOwnerOrSystem();
  const connection = await connections.read();
  return connection && { teamId: connection.teamId, teamName: connection.teamName };
}

/** The members of the connected workspace, read for another module. */
export interface SlackMembersRead {
  workspace: { id: string; name: string };
  members: SlackMember[];
  /** Identifies the connection they were read with; see `isCurrentSlackConnection`. */
  snapshot: string;
}

/** Reads every member of the connected workspace; refuses when Slack is not connected or does not answer. */
export async function readSlackMembers(
  { connections, encryption, slackApi, logger }: SlackContext,
  ctx: SecurityContext,
): Promise<SlackMembersRead> {
  ctx.requireOwnerOrSystem();
  const connection = await connections.read();
  if (!connection) {
    throw new ApplicationError("UNAVAILABLE", "Slack is not connected.");
  }
  try {
    const members = await slackApi.listMembers(encryption.decrypt(connection.encryptedToken));
    return {
      workspace: { id: connection.teamId, name: connection.teamName },
      members,
      // Encrypted anew on every connect, so a reconnect to the same workspace differs too.
      snapshot: connection.encryptedToken,
    };
  } catch (error) {
    logger.warn({ err: error }, "Reading Slack failed");
    throw new ApplicationError("UNAVAILABLE", "Could not read Slack.");
  }
}

/**
 * Locks the connection until `tx` ends and tells whether it is still the one `snapshot`
 * came from, so a caller never stores members read before a newer connect.
 */
export async function isCurrentSlackConnection(
  ctx: SecurityContext,
  tx: Tx,
  snapshot: string,
): Promise<boolean> {
  ctx.requireOwnerOrSystem();
  const connection = await slackConnectionRepository(tx).lock();
  return connection?.encryptedToken === snapshot;
}
