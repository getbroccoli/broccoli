import express from "express";

import type { SlackMember } from "../../src/integrations/slack";
import { startSimpleHttpServer } from "./simpleHttpServer";

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
