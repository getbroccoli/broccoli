import express from "express";

import { requireSignedIn } from "../../../core/actor";
import { ApplicationError } from "../../../core/applicationError";
import type { Orm } from "../../../core/db";
import { sendFile } from "../../../core/files";
import type { ActorResolver } from "../../../core/graphql";
import { type CompanyUseCases, MAX_LOGO_BYTES } from "../app";

const STATUS_OF = { UNAUTHENTICATED: 401, FORBIDDEN: 403, INVALID_INPUT: 400 } as const;

/** Where the logo with this file id is served. */
export function logoUrl(fileId: string): string {
  return `/api/company/logo/${fileId}`;
}

/**
 * `PUT /api/company/logo` takes the owner's image as the raw body; `GET
 * /api/company/logo/:fileId` serves it. A new logo is a new file, so the answer of
 * GET is cached for good.
 */
export function logoRouter(
  useCases: CompanyUseCases,
  resolveActor: ActorResolver,
  orm: Orm,
): express.Router {
  // The session cookie is renewed by GraphQL, which every page calls.
  const signedIn = async (request: express.Request) =>
    requireSignedIn((await resolveActor(request.headers)).actor);

  return express
    .Router()
    .put(
      "/company/logo",
      // The content decides the format, so any Content-Type is read; larger bodies get 413.
      express.raw({ type: () => true, limit: MAX_LOGO_BYTES }),
      async (request, response) => {
        try {
          // Without a body Express leaves `body` unset; an empty image is refused like any other.
          const bytes = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
          const company = await useCases.saveLogo(await signedIn(request), bytes);
          response.json({ logoUrl: company.logoFileId && logoUrl(company.logoFileId) });
        } catch (error) {
          sendApplicationError(error, response);
        }
      },
    )
    .get("/company/logo/:fileId", async (request, response) => {
      try {
        const { fileId } = request.params;
        if (!(await useCases.isCurrentLogo(await signedIn(request), fileId))) {
          response.sendStatus(404);
          return;
        }
        await sendFile(orm, fileId, response);
      } catch (error) {
        sendApplicationError(error, response);
      }
    });
}

/** Answers an expected failure with its status; anything else goes to Express's error handler. */
function sendApplicationError(error: unknown, response: express.Response): void {
  if (!(error instanceof ApplicationError)) {
    throw error;
  }
  const status = STATUS_OF[error.code];
  if (error.code === "INVALID_INPUT") {
    response.status(status).json({ code: error.code, fieldErrors: error.fieldErrors });
    return;
  }
  response.sendStatus(status);
}
