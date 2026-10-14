import express from "express";

import { ApplicationError, sendApplicationError } from "../../../core/applicationError";
import type { SecurityResolver } from "../../../core/graphql";
import { requireSignedIn } from "../../../core/security";
import type { SlackUseCases } from "../app";

/** Why connecting Slack failed, for the import page to explain. */
type SlackError = "cancelled" | "state" | "failed";

/** The address browsers use for this instance, such as `https://acme.example.com`. */
export type PublicOrigin = (request: express.Request) => Promise<string>;

const CALLBACK_PATH = "/api/integrations/slack/callback";
const IMPORT_PAGE = "/setup/import";
/** Holds `<state>.<code verifier>` while the browser is at Slack. */
const COOKIE = "broccoli_slack_oauth";
const COOKIE_PATH = "/api/integrations/slack";
/** As long as the relay keeps its state. */
const COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Connecting Slack through the relay. `GET /api/integrations/slack/connect` sends the
 * owner's browser to Slack; Slack's answer comes back to the callback, which stores
 * the connection and returns to the import page.
 */
export function slackRouter(
  useCases: SlackUseCases,
  resolveSecurity: SecurityResolver,
  publicOrigin: PublicOrigin,
): express.Router {
  return express
    .Router()
    .get("/integrations/slack/connect", async (request, response) => {
      try {
        const ctx = requireSignedIn((await resolveSecurity(request.headers)).security);
        const origin = await publicOrigin(request);
        const start = useCases.beginSlackConnection(ctx, `${origin}${CALLBACK_PATH}`);
        response.cookie(COOKIE, `${start.state}.${start.codeVerifier}`, {
          path: COOKIE_PATH,
          maxAge: COOKIE_MAX_AGE_MS,
          httpOnly: true,
          sameSite: "lax",
          secure: origin.startsWith("https:"),
        });
        response.redirect(302, start.authorizeUrl.href);
      } catch (error) {
        sendApplicationError(error, response);
      }
    })
    .get("/integrations/slack/callback", async (request, response) => {
      const pending = readPendingConnection(request.headers.cookie);
      const origin = await publicOrigin(request);
      response.cookie(COOKIE, "", {
        path: COOKIE_PATH,
        maxAge: 0,
        httpOnly: true,
        sameSite: "lax",
        secure: origin.startsWith("https:"),
      });
      const error = await finishConnection(useCases, resolveSecurity, request, pending);
      response.redirect(302, error ? `${IMPORT_PAGE}?slackError=${error}` : IMPORT_PAGE);
    });
}

/** Imports the workspace Slack answered with; returns why it failed, or null. */
async function finishConnection(
  useCases: SlackUseCases,
  resolveSecurity: SecurityResolver,
  request: express.Request,
  pending: { state: string; codeVerifier: string } | null,
): Promise<SlackError | null> {
  const { state, handle, error } = request.query;
  if (!pending || state !== pending.state) {
    return "state";
  }
  if (error !== undefined) {
    return error === "access_denied" ? "cancelled" : "failed";
  }
  if (typeof handle !== "string") {
    return "failed";
  }
  const { security } = await resolveSecurity(request.headers);
  if (!security) {
    return "state";
  }
  try {
    // The relay's handle is its one-time code.
    await useCases.connectSlack(security, { code: handle, codeVerifier: pending.codeVerifier });
    return null;
  } catch (failure) {
    if (failure instanceof ApplicationError && failure.code === "UNAVAILABLE") {
      return "failed";
    }
    // Only the owner may connect; anyone else came back to a flow that is not theirs.
    if (failure instanceof ApplicationError && failure.code === "FORBIDDEN") {
      return "state";
    }
    throw failure;
  }
}

/** The state and verifier `connect` stored in the cookie, or null without a usable cookie. */
function readPendingConnection(
  cookieHeader: string | undefined,
): { state: string; codeVerifier: string } | null {
  const value = cookieHeader
    ?.split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  const [state, codeVerifier, ...rest] = value?.split(".") ?? [];
  return state && codeVerifier && rest.length === 0 ? { state, codeVerifier } : null;
}
