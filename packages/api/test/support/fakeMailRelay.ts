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
  const answers: { status: number; body: string }[] = [];
  const app = express();
  app.use(express.json());
  app.post("/v1/send", (request, response) => {
    const body = request.body as (typeof emails)[number]["body"];
    if (
      typeof body.fromName !== "string" ||
      /["<>\r\n]/.test(body.fromName) ||
      body.fromName.length > 100 ||
      typeof body.subject !== "string" ||
      /[\r\n]/.test(body.subject) ||
      body.subject.length > 200
    ) {
      response.status(400).json({ error: "invalid_request" });
      return;
    }
    emails.push({
      body,
      headers: request.headers,
    });
    const answer = answers.shift();
    if (answer) {
      response.status(answer.status).type("application/json").send(answer.body);
      return;
    }
    response.json({ messageId: "relay-1" });
  });
  return {
    ...(await startSimpleHttpServer(app)),
    emails,
    answerNext(status: number, body: string, times = 1) {
      for (let attempt = 0; attempt < times; attempt++) {
        answers.push({ status, body });
      }
    },
  };
}
