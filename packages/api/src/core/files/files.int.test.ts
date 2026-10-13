import express from "express";
import { onTestFinished } from "vitest";

import { expect, startHttpServer, storedFileIds, test } from "#test/support";

import { runInTransaction, type Orm } from "../db";
import { createEventBus } from "../events";
import { createLogger } from "../logger";
import { deleteFiles, sendFile, storeFile } from ".";

test("serves stored bytes with their MIME type, immutable private caching and nosniff", async ({
  orm,
}) => {
  const eventBus = createEventBus(createLogger("silent"));
  const content = Buffer.from([0, 1, 127, 128, 255]);
  const fileId = await runInTransaction(orm, eventBus, (tx) =>
    storeFile(tx, { content, mimeType: "application/octet-stream" }),
  );
  const url = await startFileServer(orm);

  const response = await fetch(`${url}/${fileId}`);

  expect(response.status).toBe(200);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(content);
  expect(response.headers.get("content-type")).toBe("application/octet-stream");
  expect(response.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
});

test("returns 404 for an unknown file", async ({ orm }) => {
  const url = await startFileServer(orm);

  const response = await fetch(`${url}/00000000-0000-4000-8000-000000000001`);

  expect(response.status).toBe(404);
});

test("returns 404 for a deleted file", async ({ orm }) => {
  const eventBus = createEventBus(createLogger("silent"));
  const fileId = await runInTransaction(orm, eventBus, (tx) =>
    storeFile(tx, { content: Buffer.from("file"), mimeType: "application/octet-stream" }),
  );
  const url = await startFileServer(orm);

  await runInTransaction(orm, eventBus, (tx) => deleteFiles(tx, [fileId]));

  expect((await fetch(`${url}/${fileId}`)).status).toBe(404);
});

test("keeps stored files when deleting an empty list", async ({ orm }) => {
  const eventBus = createEventBus(createLogger("silent"));
  const fileId = await runInTransaction(orm, eventBus, (tx) =>
    storeFile(tx, { content: Buffer.from("file"), mimeType: "application/octet-stream" }),
  );

  await runInTransaction(orm, eventBus, (tx) => deleteFiles(tx, []));

  expect(await storedFileIds(orm)).toEqual([fileId]);
});

test("keeps stored files when deleting an unknown id", async ({ orm }) => {
  const eventBus = createEventBus(createLogger("silent"));
  const fileId = await runInTransaction(orm, eventBus, (tx) =>
    storeFile(tx, { content: Buffer.from("file"), mimeType: "application/octet-stream" }),
  );

  await runInTransaction(orm, eventBus, (tx) =>
    deleteFiles(tx, ["00000000-0000-4000-8000-000000000001"]),
  );

  expect(await storedFileIds(orm)).toEqual([fileId]);
});

test("does not keep a file when its transaction rolls back", async ({ orm }) => {
  const eventBus = createEventBus(createLogger("silent"));

  await expect(
    runInTransaction(orm, eventBus, async (tx) => {
      await storeFile(tx, {
        content: Buffer.from("file"),
        mimeType: "application/octet-stream",
      });
      throw new Error("Work failed");
    }),
  ).rejects.toThrow("Work failed");

  expect(await storedFileIds(orm)).toEqual([]);
});

async function startFileServer(orm: Orm): Promise<string> {
  const app = express().get("/:fileId", (request, response) =>
    sendFile(orm, request.params.fileId, response),
  );
  const server = await startHttpServer(app);
  onTestFinished(server.stop);
  return server.url;
}
