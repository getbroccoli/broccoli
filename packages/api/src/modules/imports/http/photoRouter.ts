import express from "express";

import { sendApplicationError } from "../../../core/applicationError";
import type { Orm } from "../../../core/db";
import { sendFile } from "../../../core/files";
import type { SecurityResolver } from "../../../core/graphql";
import { requireSignedIn } from "../../../core/security";
import type { ImportUseCases } from "../app";

/** Where the import photo in this file is served. */
export function importPhotoUrl(fileId: string): string {
  return `/api/imports/photos/${fileId}`;
}

/** `GET /api/imports/photos/:fileId` serves an import employee's photo, cached for good. */
export function photoRouter(
  useCases: ImportUseCases,
  resolveSecurity: SecurityResolver,
  orm: Orm,
): express.Router {
  return express.Router().get("/imports/photos/:fileId", async (request, response) => {
    try {
      const ctx = requireSignedIn((await resolveSecurity(request.headers)).security);
      const { fileId } = request.params;
      if (!(await useCases.reads.isImportPhotoFile(ctx, fileId))) {
        response.sendStatus(404);
        return;
      }
      await sendFile(orm, fileId, response);
    } catch (error) {
      sendApplicationError(error, response);
    }
  });
}
