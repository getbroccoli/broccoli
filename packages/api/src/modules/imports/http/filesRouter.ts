import express from "express";
import { rateLimit } from "express-rate-limit";

import { sendApplicationError } from "../../../core/applicationError";
import type { SecurityResolver } from "../../../core/security";
import { requireSignedIn, type SecurityContext } from "../../../core/security";
import type { ImportUseCases } from "../app";
import { parseStaffFileName } from "../domain";

/** Large enough for a staff list of thousands of people. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Far more than an owner adding files by hand needs. */
const UPLOADS_PER_MINUTE = 30;

/**
 * `POST /api/imports/files?name=<file name>` takes a CSV or Excel staff file as the raw body and
 * answers the new source's id; its mapping runs in the background.
 */
export function filesRouter(
  useCases: ImportUseCases,
  resolveSecurity: SecurityResolver,
): express.Router {
  return express.Router().post(
    "/imports/files",
    // Before the body, so a request without a session never gets memory for it.
    async (request, response, next) => {
      try {
        response.locals.ctx = requireSignedIn((await resolveSecurity(request.headers)).security);
        next();
      } catch (error) {
        sendApplicationError(error, response);
      }
    },
    rateLimit({
      windowMs: 60_000,
      limit: UPLOADS_PER_MINUTE,
      keyGenerator: (_request, response) => signedInContext(response).user?.userId ?? "system",
    }),
    // The content decides how the file is read, so any Content-Type is read; larger bodies get 413.
    express.raw({ type: () => true, limit: MAX_FILE_BYTES }),
    async (request, response) => {
      try {
        const ctx = signedInContext(response);
        const name = parseStaffFileName(request.query.name);
        // Without a body Express leaves `body` unset; an empty file is refused like any other.
        const bytes = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
        response.json({ sourceId: await useCases.files.uploadFile(ctx, { name, bytes }) });
      } catch (error) {
        sendApplicationError(error, response);
      }
    },
  );
}

function signedInContext(response: express.Response): SecurityContext {
  return response.locals.ctx as SecurityContext;
}
