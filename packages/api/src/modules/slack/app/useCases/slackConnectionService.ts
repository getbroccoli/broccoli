import { createHash, randomBytes } from "node:crypto";

import { ApplicationError } from "../../../../core/applicationError";
import type { Orm, Transact, Tx } from "../../../../core/db";
import type { Logger } from "../../../../core/logger";
import type { SecretBox } from "../../../../core/secrets";
import type { SecurityContext } from "../../../../core/security";
import type {
  SlackApi,
  SlackAuthorization,
  SlackGrant,
  SlackMember,
} from "../../../../integrations/slack";
import { slackConnectionRepository } from "../../db";
import { readSlackPeople, type SlackPerson } from "./readSlackPeople";

/**
 * The whole life of the Slack connection in one place: starting it, finishing it when
 * the browser returns, reading the connected workspace for the owner and, with its
 * people's photos, for other modules, and forgetting it. Every function checks `ctx` itself.
 */
export interface SlackConnectionService {
  /** Starts connecting Slack: the browser goes to Slack and comes back to `returnTo`. */
  beginSlackConnection(ctx: SecurityContext, returnTo: string): SlackConnectionStart;
  /**
   * Finishes connecting Slack when the browser returns: checks that the return belongs
   * to this browser and the owner, exchanges the code, and stores the workspace with
   * its token encrypted. Reading its members is up to the caller. Null on success.
   */
  finishSlackConnection(
    ctx: SecurityContext,
    slackReturn: SlackConnectionReturn,
  ): Promise<SlackConnectionFailure | null>;
  /** The connected workspace, or null. */
  getSlackConnection(ctx: SecurityContext): Promise<{ teamId: string; teamName: string } | null>;
  /**
   * The people of the connected workspace with their photos, downloading only those whose
   * link `knownPhotos` does not hold; refuses when Slack is not connected or does not answer.
   */
  readSlackMembers(
    ctx: SecurityContext,
    options: { knownPhotos: ReadonlyMap<string, string> },
  ): Promise<SlackMembersRead>;
  /** Forgets the connected workspace and its token inside the caller's transaction. */
  disconnectSlack(ctx: SecurityContext, tx: Tx): Promise<void>;
}

/** Where to send the browser to connect Slack, and what the browser keeps until it returns. */
export interface SlackConnectionStart {
  authorizeUrl: URL;
  /** Opaque; handed back to `finishSlackConnection` when the browser returns. */
  pendingToken: string;
}

/** What came back with the browser: the pending token it kept and Slack's answer. */
export interface SlackConnectionReturn {
  pendingToken: string | undefined;
  state: string | undefined;
  /** The one-time code; the relay calls it `handle`. */
  code: string | undefined;
  error: string | undefined;
}

/** Why connecting Slack failed, for the import page to explain. */
export type SlackConnectionFailure = "cancelled" | "state" | "failed";

/** The people of the connected workspace, read for another module. */
export interface SlackMembersRead {
  workspace: { id: string; name: string };
  members: SlackPerson[];
  /**
   * Locks the connection until `tx` ends and tells whether it is still the one the members
   * were read with, so a caller never stores members read before a newer connect.
   */
  isStillCurrent: (tx: Tx) => Promise<boolean>;
}

export function createSlackConnectionService({
  orm,
  transact,
  logger,
  secretBox,
  slackAuthorization,
  slackApi,
  clock = () => new Date(),
}: {
  orm: Orm;
  transact: Transact;
  logger: Logger;
  secretBox: SecretBox;
  slackAuthorization: SlackAuthorization;
  slackApi: SlackApi;
  /** Now; tests pass their own. */
  clock?: () => Date;
}): SlackConnectionService {
  const connections = slackConnectionRepository(orm);

  return {
    beginSlackConnection: (ctx: SecurityContext, returnTo: string): SlackConnectionStart => {
      ctx.requireSetupAccess();
      const pending = { state: randomToken(), codeVerifier: randomToken() };
      const codeChallenge = createHash("sha256").update(pending.codeVerifier).digest("base64url");
      return {
        authorizeUrl: slackAuthorization.authorizeUrl({
          returnTo,
          state: pending.state,
          codeChallenge,
        }),
        pendingToken: formatPendingToken(pending),
      };
    },

    finishSlackConnection: async (
      ctx: SecurityContext,
      { pendingToken, state, code, error }: SlackConnectionReturn,
    ): Promise<SlackConnectionFailure | null> => {
      const pending = parsePendingToken(pendingToken);
      if (!pending || state !== pending.state) {
        return "state";
      }
      if (error !== undefined) {
        return error === "access_denied" ? "cancelled" : "failed";
      }
      if (code === undefined) {
        return "failed";
      }
      if (!mayConnect(ctx)) {
        // Someone else came back to a flow that is not theirs.
        return "state";
      }
      // Slack is asked before the transaction, which never waits on another service.
      const grant = await exchangeCode({ slackAuthorization, logger }, code, pending.codeVerifier);
      if (!grant) {
        return "failed";
      }
      await transact((tx) =>
        slackConnectionRepository(tx).save({
          teamId: grant.team.id,
          teamName: grant.team.name,
          encryptedToken: secretBox.encrypt(grant.accessToken),
        }),
      );
      return null;
    },

    getSlackConnection: async (
      ctx: SecurityContext,
    ): Promise<{ teamId: string; teamName: string } | null> => {
      ctx.requireSetupAccess();
      const connection = await connections.read();
      return connection && { teamId: connection.teamId, teamName: connection.teamName };
    },

    readSlackMembers: async (
      ctx: SecurityContext,
      { knownPhotos }: { knownPhotos: ReadonlyMap<string, string> },
    ): Promise<SlackMembersRead> => {
      ctx.requireSetupAccess();
      const startedAt = clock();
      const connection = await connections.read();
      if (!connection) {
        throw new ApplicationError("UNAVAILABLE", "Slack is not connected.");
      }
      const members = await listMembers(
        { slackApi, secretBox, logger: logger.child({ teamId: connection.teamId }) },
        connection.encryptedToken,
      );
      return {
        workspace: { id: connection.teamId, name: connection.teamName },
        members: await readSlackPeople(members, {
          slackApi,
          logger,
          clock,
          startedAt,
          knownPhotos,
        }),
        // Encrypted anew on every connect, so a reconnect to the same workspace differs too.
        isStillCurrent: async (tx: Tx): Promise<boolean> =>
          (await slackConnectionRepository(tx).lock())?.encryptedToken ===
          connection.encryptedToken,
      };
    },

    disconnectSlack: async (ctx: SecurityContext, tx: Tx): Promise<void> => {
      ctx.requireSetupAccess();
      await slackConnectionRepository(tx).delete();
    },
  };
}

/** Every member of the workspace; refused as unavailable when Slack does not answer. */
async function listMembers(
  { slackApi, secretBox, logger }: { slackApi: SlackApi; secretBox: SecretBox; logger: Logger },
  encryptedToken: string,
): Promise<SlackMember[]> {
  try {
    return await slackApi.listMembers(secretBox.decrypt(encryptedToken));
  } catch (error) {
    logger.warn({ kind: (error as Error | undefined)?.constructor?.name }, "Reading Slack failed");
    throw new ApplicationError("UNAVAILABLE", "Could not read Slack.");
  }
}

/** Exchanges the code and checks the scopes; null when Slack refused. */
async function exchangeCode(
  { slackAuthorization, logger }: { slackAuthorization: SlackAuthorization; logger: Logger },
  code: string,
  codeVerifier: string,
): Promise<SlackGrant | null> {
  try {
    const grant = await slackAuthorization.exchange({ code, codeVerifier });
    if (!REQUIRED_SCOPES.every((scope) => grant.scopes.includes(scope))) {
      throw new Error(`Slack granted ${grant.scopes.join(",")}, not ${REQUIRED_SCOPES.join(",")}`);
    }
    return grant;
  } catch (error) {
    logger.warn(
      { kind: (error as Error | undefined)?.constructor?.name },
      "Connecting Slack failed",
    );
    return null;
  }
}

/** Scopes Broccoli needs: the member list and each member's email. */
const REQUIRED_SCOPES = ["users:read", "users:read.email"];

/** Whether `ctx` may connect Slack; the context decides, the flow only turns a refusal into an outcome. */
function mayConnect(ctx: SecurityContext): boolean {
  try {
    ctx.requireSetupAccess();
    return true;
  } catch (error) {
    if (error instanceof ApplicationError && error.code === "FORBIDDEN") {
      return false;
    }
    throw error;
  }
}

/** 32 random bytes: a 43-character base64url string, as PKCE requires of the verifier. */
function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** `<state>.<code verifier>`; base64url never contains a dot. */
function formatPendingToken({ state, codeVerifier }: { state: string; codeVerifier: string }) {
  return `${state}.${codeVerifier}`;
}

function parsePendingToken(
  token: string | undefined,
): { state: string; codeVerifier: string } | null {
  const [state, codeVerifier, ...rest] = token?.split(".") ?? [];
  return state && codeVerifier && rest.length === 0 ? { state, codeVerifier } : null;
}
