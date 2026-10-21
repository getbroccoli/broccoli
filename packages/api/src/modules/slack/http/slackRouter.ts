import express from "express";

import { sendApplicationError } from "../../../core/applicationError";
import type { SecurityResolver } from "../../../core/security";
import { requireSignedIn } from "../../../core/security";
import { readCookie } from "../../../utils";
import type { SlackConnectionService } from "../app";

/** The address browsers use for this instance, such as `https://acme.example.com`. */
export type PublicOrigin = (request: express.Request) => Promise<string>;

const CALLBACK_PATH = "/api/integrations/slack/callback";
const IMPORT_PAGE = "/setup/import";
/** Holds the pending connection while the browser is at Slack. */
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
  slackConnection: SlackConnectionService,
  resolveSecurity: SecurityResolver,
  publicOrigin: PublicOrigin,
): express.Router {
  return express
    .Router()
    .get("/integrations/slack/connect", async (request, response) => {
      try {
        const ctx = requireSignedIn((await resolveSecurity(request.headers)).security);
        const origin = await publicOrigin(request);
        const start = slackConnection.beginSlackConnection(ctx, `${origin}${CALLBACK_PATH}`);
        response.cookie(COOKIE, start.pendingToken, {
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
      const pendingToken = readCookie(request.headers.cookie, COOKIE);
      const origin = await publicOrigin(request);
      response.cookie(COOKIE, "", {
        path: COOKIE_PATH,
        maxAge: 0,
        httpOnly: true,
        sameSite: "lax",
        secure: origin.startsWith("https:"),
      });
      const { security } = await resolveSecurity(request.headers);
      const { state, handle, error } = request.query;
      const failure = security
        ? await slackConnection.finishSlackConnection(security, {
            pendingToken,
            state: asText(state),
            code: asText(handle),
            error: asText(error),
          })
        : "state";
      response.redirect(302, failure ? `${IMPORT_PAGE}?slackError=${failure}` : IMPORT_PAGE);
    });
}

/** A query parameter given once, as text; Express parses repeats and brackets into other shapes. */
function asText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
