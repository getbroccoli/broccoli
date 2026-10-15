import express from "express";

import { invalidInput, sendApplicationError } from "../../../core/applicationError";
import type { SecurityResolver } from "../../../core/graphql";
import { requireSignedIn } from "../../../core/security";
import type { ImportUseCases } from "../app";

/** Large enough for a staff list of thousands of people. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_NAME_LENGTH = 255;

/**
 * `POST /api/imports/files?name=<file name>` takes a CSV staff file as the raw body and
 * answers the new source's id; its mapping runs in the background.
 */
export function filesRouter(
  useCases: ImportUseCases,
  resolveSecurity: SecurityResolver,
): express.Router {
  return express
    .Router()
    .post(
      "/imports/files",
      // The content decides whether it is a CSV, so any Content-Type is read; larger bodies get 413.
      express.raw({ type: () => true, limit: MAX_FILE_BYTES }),
      async (request, response) => {
        try {
          const ctx = requireSignedIn((await resolveSecurity(request.headers)).security);
          const name = parseFileName(request.query.name);
          // Without a body Express leaves `body` unset; an empty file is refused like any other.
          const bytes = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
          response.json({ sourceId: await useCases.uploadFile(ctx, { name, bytes }) });
        } catch (error) {
          sendApplicationError(error, response);
        }
      },
    );
}

/** The file's name as the browser sent it; only `.csv` files are read. */
function parseFileName(name: unknown): string {
  if (typeof name !== "string" || !name.toLowerCase().endsWith(".csv")) {
    throw invalidInput([{ field: "file", code: "not_csv" }]);
  }
  return name.slice(-MAX_NAME_LENGTH);
}
