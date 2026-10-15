import express from "express";
import { expect } from "vitest";

import type { SlackMember } from "../../src/integrations/slack";
import { startSimpleHttpServer } from "./simpleHttpServer";
import type { Browser } from "./browser";

/** A local relay and Slack API; tests control pages and inspect the HTTP requests. */
export async function startFakeSlack() {
  const pages: SlackMember[][] = [[]];
  let nextUsersListBody: unknown;
  const requests: {
    method: string;
    path: string;
    authorization: string | undefined;
    body: unknown;
  }[] = [];
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    requests.push({
      method: request.method,
      path: request.originalUrl,
      authorization: request.get("authorization"),
      body: request.body,
    });
    next();
  });
  app.post("/slack/redeem", (_request, response) => {
    response.json({
      ok: true,
      access_token: "test-slack-token",
      scope: "users:read,users:read.email",
      team: { id: "T1", name: "Acme Workspace" },
    });
  });
  app.get("/users.list", (request, response) => {
    if (nextUsersListBody !== undefined) {
      response.json(nextUsersListBody);
      nextUsersListBody = undefined;
      return;
    }
    const page = request.query.cursor === undefined ? 0 : Number(request.query.cursor);
    if (!Number.isInteger(page) || !pages[page]) {
      response.status(400).json({ ok: false, error: "invalid_cursor" });
      return;
    }
    response.json({
      ok: true,
      members: pages[page],
      response_metadata: { next_cursor: page + 1 < pages.length ? String(page + 1) : "" },
    });
  });
  return {
    ...(await startSimpleHttpServer(app)),
    pages,
    requests,
    replyToNextUsersList: (body: unknown) => {
      nextUsersListBody = body;
    },
  };
}

/** Connects Slack through the fake relay and reads its members into the import. */
export async function connectAndReadSlack(browser: Browser) {
  const { state } = slackAuthorization(await browser.getManual("/api/integrations/slack/connect"));
  const callback = await browser.getManual(
    `/api/integrations/slack/callback?${new URLSearchParams({ state, handle: "test-handle" }).toString()}`,
  );
  expect(callback.status).toBe(302);
  expect(callback.headers.get("location")).toBe("/setup/import");
  const imported = await browser.graphql("mutation { import { readSlack { id } } }");
  expect(await imported.json()).toEqual({ data: { import: { readSlack: { id: "import" } } } });
}

export function slackAuthorization(response: Response) {
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("broccoli_slack_oauth="));
  if (!cookie) throw new Error("The Slack OAuth cookie is missing");
  const location = response.headers.get("location");
  if (!location) throw new Error("The authorization redirect is missing");
  const authorizeUrl = new URL(location);
  const state = authorizeUrl.searchParams.get("state");
  if (!state) throw new Error("The authorization state is missing");
  return { cookie, state, authorizeUrl };
}
