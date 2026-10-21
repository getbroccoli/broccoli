import express from "express";
import { rateLimit } from "express-rate-limit";

import { sendApplicationError } from "../../../core/applicationError";
import type { SecurityResolver } from "../../../core/graphql";
import { requireSignedIn, type SecurityContext } from "../../../core/security";
import { parseStaffFileName } from "../../imports";
import type { ExternalAgentUseCases } from "../app";

/** Large enough for a staff list of thousands of people, as the import's own upload. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Far more than an owner dropping files by hand needs. */
const UPLOADS_PER_MINUTE = 30;

/**
 * `POST /api/setup/external-agent-files?name=<file name>` takes a CSV or Excel staff file the setup holder
 * drops for their external agent, as the raw body, and answers the new source's id. Nothing maps
 * it until the agent answers its masked questions.
 */
export function externalAgentFilesRouter(
  useCases: ExternalAgentUseCases,
  resolveSecurity: SecurityResolver,
): express.Router {
  return express.Router().post(
    "/setup/external-agent-files",
    // Before the body, so a request without a session never gets memory for it.
    async (request, response, next) => {
      try {
        response.locals.ctx = requireSignedIn((await resolveSecurity(request.headers)).security);
        next();
      } catch (error) {
        sendApplicationError(error, response);
      }
    },
    rateLimit({ windowMs: 60_000, limit: UPLOADS_PER_MINUTE, keyGenerator: () => "setup" }),
    // The content decides how the file is read, so any Content-Type is read; larger bodies get 413.
    express.raw({ type: () => true, limit: MAX_FILE_BYTES }),
    async (request, response) => {
      try {
        const ctx = response.locals.ctx as SecurityContext;
        const name = parseStaffFileName(request.query.name);
        // Without a body Express leaves `body` unset; an empty file is refused like any other.
        const bytes = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
        response.json({ id: await useCases.files.uploadForExternalAgent(ctx, { name, bytes }) });
      } catch (error) {
        sendApplicationError(error, response);
      }
    },
  );
}
