import express from "express";

import { ApplicationError } from "../../../core/application-error";
import type { ActorResolver } from "../../../core/graphql";
import type { CompanyUseCases } from "../app";

const STATUS_OF = { UNAUTHENTICATED: 401, FORBIDDEN: 403 } as const;

/** `GET /api/company/logo/:logoId`; a new logo gets a new id, so the answer is cached for good. */
export function logoRouter(useCases: CompanyUseCases, resolveActor: ActorResolver): express.Router {
  return express.Router().get("/company/logo/:logoId", async (request, response) => {
    try {
      const logo = await useCases.readLogo(
        await resolveActor(request.headers),
        request.params.logoId,
      );
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
      if (error instanceof ApplicationError && error.code in STATUS_OF) {
        response.sendStatus(STATUS_OF[error.code as keyof typeof STATUS_OF]);
        return;
      }
      throw error;
    }
  });
}
