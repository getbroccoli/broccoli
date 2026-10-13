import { createHash, randomBytes } from "node:crypto";

import { type Actor, requireOwner } from "../../../../core/actor";
import type { ImportContext } from "./importContext";
import { requireSlackAuthorization } from "./slackRecords";

/** Where to send the browser to connect Slack, with the values its return must match. */
export interface SlackConnectionStart {
  authorizeUrl: URL;
  /** Must come back unchanged, so the return belongs to this browser. */
  state: string;
  /** Proves to the relay that the one who redeems the handle started the flow (PKCE). */
  codeVerifier: string;
}

/** Starts connecting Slack: the browser goes to the relay and comes back to `returnTo`. */
export function beginSlackConnection(
  { slackAuthorization }: ImportContext,
  actor: Actor,
  returnTo: string,
): SlackConnectionStart {
  requireOwner(actor);
  const authorization = requireSlackAuthorization(slackAuthorization);
  const state = randomBytes(RANDOM_BYTES).toString("base64url");
  const codeVerifier = randomBytes(RANDOM_BYTES).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return {
    authorizeUrl: authorization.authorizeUrl({ returnTo, state, codeChallenge }),
    state,
    codeVerifier,
  };
}

/** 32 random bytes: a 43-character base64url string, as PKCE requires. */
const RANDOM_BYTES = 32;
