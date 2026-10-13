import { type Actor, requireOwner } from "../../../../core/actor";
import { ApplicationError } from "../../../../core/applicationError";
import { runInTransaction } from "../../../../core/db";
import type { SlackGrant } from "../../../../integrations/slack";
import { importRepository } from "../../db";
import type { IncomingRecord } from "../../domain";
import type { ImportContext } from "./importContext";
import { readSlackRecords } from "./slackRecords";

/**
 * Finishes connecting Slack after the browser's return: exchanges the one-time code,
 * reads the members, then stores the connection and makes the Slack source hold them.
 */
export async function connectSlack(
  context: ImportContext,
  actor: Actor,
  params: { code: string; codeVerifier: string },
): Promise<void> {
  requireOwner(actor);
  // Slack is read before the transaction, which never waits on another service.
  const { grant, records } = await readWorkspace(context, params);
  await runInTransaction(context.orm, context.eventBus, async (tx) => {
    const imports = importRepository(tx);
    await imports.lockSlackConnection();
    await imports.saveSlackConnection({
      teamId: grant.team.id,
      teamName: grant.team.name,
      encryptedToken: context.encryption.encrypt(grant.accessToken),
    });
    const sourceId = await imports.saveSlackSource(grant.team.name);
    await imports.syncEmployeeRecords(sourceId, records);
  });
}

/** Scopes the import needs: the member list and each member's email. */
const REQUIRED_SCOPES = ["users:read", "users:read.email"];

async function readWorkspace(
  { slackAuthorization, slackApi, logger }: ImportContext,
  params: { code: string; codeVerifier: string },
): Promise<{ grant: SlackGrant; records: IncomingRecord[] }> {
  try {
    const grant = await slackAuthorization.exchange(params);
    if (!REQUIRED_SCOPES.every((scope) => grant.scopes.includes(scope))) {
      throw new Error(`Slack granted ${grant.scopes.join(",")}, not ${REQUIRED_SCOPES.join(",")}`);
    }
    return { grant, records: await readSlackRecords(slackApi, grant.accessToken) };
  } catch (error) {
    logger.warn({ err: error }, "Connecting Slack failed");
    throw new ApplicationError("UNAVAILABLE", "Could not connect Slack.");
  }
}
