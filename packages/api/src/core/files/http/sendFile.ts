import type express from "express";

import type { Orm } from "../../db";
import { readFile } from "../app";

/**
 * Answers with the file, cached for good because a file never changes, or 404. It
 * checks no access: pass only an id the caller matched against its own records.
 */
export async function sendFile(
  orm: Orm,
  fileId: string,
  response: express.Response,
): Promise<void> {
  const file = await readFile(orm, fileId);
  if (!file) {
    response.sendStatus(404);
    return;
  }
  response
    .type(file.mimeType)
    .set({
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    })
    .send(file.content);
}
