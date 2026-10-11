import express from "express";

import { requireSignedIn } from "../../../core/actor";
import { ApplicationError } from "../../../core/application-error";
import type { ActorResolver } from "../../../core/graphql";
import type { CompanyUseCases } from "../app";
import { MAX_LOGO_BYTES } from "../domain";

const STATUS_OF = { UNAUTHENTICATED: 401, FORBIDDEN: 403, INVALID_INPUT: 400 } as const;

/** Where the logo with this id is served. */
export function logoUrl(logoId: string): string {
  return `/api/company/logo/${logoId}`;
}

/**
 * `PUT /api/company/logo` takes the owner's image as the raw body; `GET
 * /api/company/logo/:logoId` serves it. A new logo gets a new id, so the answer of
 * GET is cached for good.
 */
export function logoRouter(useCases: CompanyUseCases, resolveActor: ActorResolver): express.Router {
  const signedIn = async (request: express.Request) =>
    requireSignedIn(await resolveActor(request.headers));

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
          response.json({ logoUrl: company.logoId && logoUrl(company.logoId) });
        } catch (error) {
          sendApplicationError(error, response);
        }
      },
    )
    .get("/company/logo/:logoId", async (request, response) => {
      try {
        const logo = await useCases.readLogo(await signedIn(request), request.params.logoId);
        if (!logo) {
          response.sendStatus(404);
          return;
        }
        response
          .type(logo.mimeType)
          .set({
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
          })
          .send(logo.bytes);
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
