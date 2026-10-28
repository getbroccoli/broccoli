import type { IncomingHttpHeaders } from "node:http";

import express from "express";

import { startSimpleHttpServer } from "./simpleHttpServer";

export async function startFakeResend() {
  const emails: {
    body: { from: string; to: string[]; subject: string; text: string; html: string };
    headers: IncomingHttpHeaders;
  }[] = [];
  const app = express();
  app.use(express.json());
  app.post("/emails", (request, response) => {
    emails.push({
      body: request.body as (typeof emails)[number]["body"],
      headers: request.headers,
    });
    response.json({ id: "email-1" });
  });
  return { ...(await startSimpleHttpServer(app)), emails };
}
