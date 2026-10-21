import { readFileSync } from "node:fs";

import express from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Logger } from "../../../core/logger";
import { PrincipalSecurityContext, type SecurityContext } from "../../../core/security";
import type { MappingAnswersInput } from "../../imports";
import type { ExternalAgentUseCases } from "../app";
import { externalAgentErrorHandler, tooManyRequests } from "./externalAgentErrors";

/** Large enough for a staff list of thousands of people. */
const MAX_BODY_BYTES = 5 * 1024 * 1024;
/** Far more than an agent mapping a few files needs. */
const FILE_REQUESTS_PER_MINUTE = 30;
/** Long enough to cover a quiet stretch, short enough for proxies and agents' shells. */
const MAX_WAIT_SECONDS = 600;
/** Exchanges per address and minute, and for the whole instance: enough for a person, little for guessing. */
const EXCHANGES_PER_ADDRESS_PER_MINUTE = 10;
const EXCHANGES_PER_MINUTE = 30;
const SKILL = readFileSync(new URL("./broccoliSetupSkill.md", import.meta.url), "utf8");

/**
 * The owner's external agent's routes under `/api/external-agent`: the skill, the code exchange, and its
 * work on files, each by its bearer token alone; a cookie never counts here, nor does a bearer
 * anywhere else. Answers are never cached.
 */
export function externalAgentRouter(
  useCases: ExternalAgentUseCases,
  logger: Logger,
): express.Router {
  const asExternalAgent = externalAgentSession(useCases);
  const perSession = rateLimit({
    windowMs: 60_000,
    limit: FILE_REQUESTS_PER_MINUTE,
    keyGenerator: (_request, response) => externalAgentOf(response).externalAgentSessionId!,
    handler: tooManyRequests,
  });
  const json = express.json({ limit: MAX_BODY_BYTES });

  return express
    .Router()
    .use("/external-agent", (_request, response, next) => {
      response.set("Cache-Control", "no-store");
      next();
    })
    .get("/external-agent/skill", (_request, response) => {
      response.type("text/markdown").send(SKILL);
    })
    .post(
      "/external-agent/session",
      rateLimit({
        windowMs: 60_000,
        limit: EXCHANGES_PER_ADDRESS_PER_MINUTE,
        // Without a trusted proxy the socket address counts; a forwarded header is ignored.
        validate: { xForwardedForHeader: false },
        handler: tooManyRequests,
      }),
      rateLimit({
        windowMs: 60_000,
        limit: EXCHANGES_PER_MINUTE,
        keyGenerator: () => "instance",
        handler: tooManyRequests,
      }),
      express.json(),
      async (request, response) => {
        const { code, client } = (request.body ?? {}) as { code?: unknown; client?: unknown };
        const session = await useCases.sessions.startExternalAgentSession(
          PrincipalSecurityContext.system(),
          {
            code: typeof code === "string" ? code : "",
            client,
          },
        );
        response.json(session);
      },
    )
    .get(
      "/external-agent/unanswered-files",
      asExternalAgent,
      perSession,
      async (request, response) => {
        const ctx = externalAgentOf(response);
        const seconds = waitSecondsOf(request);
        response.json(
          seconds === null
            ? await useCases.files.listUnansweredFiles(ctx)
            : await useCases.files.waitForUnansweredFiles(ctx, { seconds }),
        );
      },
    )
    .get(
      "/external-agent/unanswered-files/:id/questions",
      asExternalAgent,
      perSession,
      async (request, response) => {
        response.json(
          await useCases.files.readMappingQuestions(externalAgentOf(response), sourceIdOf(request)),
        );
      },
    )
    .post(
      "/external-agent/unanswered-files/:id/answers",
      asExternalAgent,
      perSession,
      json,
      async (request, response) => {
        response.json(
          await useCases.files.answerMappingQuestions(
            externalAgentOf(response),
            sourceIdOf(request),
            parseAnswers(request.body),
          ),
        );
      },
    )
    .use("/external-agent", externalAgentErrorHandler(logger));
}

const BEARER = /^Bearer (\S{1,200})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Admits a request by its bearer token alone, as the external agent's security context. */
function externalAgentSession(useCases: ExternalAgentUseCases): express.RequestHandler {
  // Express 5 passes a rejected handler on to the router's error handler.
  return async (request, response, next) => {
    const token = BEARER.exec(request.headers.authorization ?? "")?.[1];
    const ctx = token && (await useCases.sessions.readExternalAgentSession({ token }));
    if (!ctx) {
      throw new ApplicationError("UNAUTHENTICATED", "Your agent's session ended.");
    }
    response.locals.ctx = ctx;
    next();
  };
}

function externalAgentOf(response: express.Response): SecurityContext {
  return response.locals.ctx as SecurityContext;
}

/** A source id from the path; anything but a UUID names no file. */
function sourceIdOf(request: express.Request): string {
  const id = request.params.id;
  if (typeof id !== "string" || !UUID.test(id)) {
    throw new ApplicationError("NOT_FOUND", "No file waits for your answers with this id.");
  }
  return id;
}

/** The `wait` query parameter: whole seconds, 1 to 600; null without one. */
function waitSecondsOf(request: express.Request): number | null {
  const { wait } = request.query;
  if (wait === undefined) {
    return null;
  }
  const seconds = typeof wait === "string" && /^\d{1,3}$/.test(wait) ? Number(wait) : 0;
  if (seconds < 1 || seconds > MAX_WAIT_SECONDS) {
    throw invalidInput([{ field: "wait", code: "invalid" }]);
  }
  return seconds;
}

/** The answers' shape: a list of sheets, each with its number and string answers. */
function parseAnswers(body: unknown): MappingAnswersInput {
  const parsed = ANSWERS.safeParse(body);
  if (!parsed.success) {
    throw invalidInput([{ field: "sheets", code: "invalid" }]);
  }
  return parsed.data;
}

const ANSWERS = z.object({
  sheets: z.array(z.object({ sheet: z.number(), answers: z.record(z.string(), z.string()) })),
});
