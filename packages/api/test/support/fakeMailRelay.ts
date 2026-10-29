import type { IncomingHttpHeaders } from "node:http";

import express from "express";

import { startSimpleHttpServer } from "./simpleHttpServer";

export async function startFakeMailRelay() {
  const emails: {
    body: {
      to: string;
      fromName: string;
      subject: string;
      text: string;
      html: string;
      idempotencyKey: string;
    };
    headers: IncomingHttpHeaders;
  }[] = [];
  const app = express();
  app.use(express.json());
  app.post("/v1/send", (request, response) => {
    emails.push({
      body: request.body as (typeof emails)[number]["body"],
      headers: request.headers,
    });
    response.json({ messageId: "relay-1" });
  });
  return { ...(await startSimpleHttpServer(app)), emails };
}
