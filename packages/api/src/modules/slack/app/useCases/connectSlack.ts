import { type Actor, requireOwner } from "../../../../core/actor";
import { ApplicationError } from "../../../../core/applicationError";
import { runInTransaction } from "../../../../core/db";
import type { SlackGrant } from "../../../../integrations/slack";
import { slackConnectionRepository } from "../../db";
import type { SlackContext } from "./slackContext";

/**
 * Finishes connecting Slack after the browser's return: exchanges the one-time code and
 * stores the workspace with its token encrypted. Reading its members is up to the caller.
 */
export async function connectSlack(
  context: SlackContext,
  actor: Actor,
  params: { code: string; codeVerifier: string },
): Promise<void> {
  requireOwner(actor);
  // Slack is asked before the transaction, which never waits on another service.
  const grant = await exchangeCode(context, params);
  await runInTransaction(context.orm, context.eventBus, (tx) =>
    slackConnectionRepository(tx).save({
      teamId: grant.team.id,
      teamName: grant.team.name,
      encryptedToken: context.encryption.encrypt(grant.accessToken),
    }),
  );
}

/** Scopes Broccoli needs: the member list and each member's email. */
const REQUIRED_SCOPES = ["users:read", "users:read.email"];

async function exchangeCode(
  { slackAuthorization, logger }: SlackContext,
  params: { code: string; codeVerifier: string },
): Promise<SlackGrant> {
  try {
    const grant = await slackAuthorization.exchange(params);
    if (!REQUIRED_SCOPES.every((scope) => grant.scopes.includes(scope))) {
      throw new Error(`Slack granted ${grant.scopes.join(",")}, not ${REQUIRED_SCOPES.join(",")}`);
    }
    return grant;
  } catch (error) {
    logger.warn({ err: error }, "Connecting Slack failed");
    throw new ApplicationError("UNAVAILABLE", "Could not connect Slack.");
  }
}
