import type express from "express";

import type { StoredFile } from "../app";

/**
 * Answers with the file, cached for good because a file never changes, or 404 for null. It
 * checks no access: pass only a file a module's use case read after its own checks.
 */
export function sendFile(file: StoredFile | null, response: express.Response): void {
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
