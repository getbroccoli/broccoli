import express from "express";

import { sendApplicationError } from "../../../core/applicationError";
import { sendFile } from "../../../core/files";
import type { SecurityResolver } from "../../../core/security";
import { requireSignedIn } from "../../../core/security";
import type { ImportServices } from "../app";

/** Where the import photo in this file is served. */
export function importPhotoUrl(fileId: string): string {
  return `/api/imports/photos/${fileId}`;
}

/** `GET /api/imports/photos/:fileId` serves an import employee's photo, cached for good. */
export function photoRouter(
  services: ImportServices,
  resolveSecurity: SecurityResolver,
): express.Router {
  return express.Router().get("/imports/photos/:fileId", async (request, response) => {
    try {
      const ctx = requireSignedIn((await resolveSecurity(request.headers)).security);
      sendFile(await services.reads.readImportPhoto(ctx, request.params.fileId), response);
    } catch (error) {
      sendApplicationError(error, response);
    }
  });
}
