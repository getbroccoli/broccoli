import { expect, it, onTestFinished } from "vitest";

import { PNG, startFakeHttpServer, startSimpleHttpServer } from "#test/support";

import { fetchBytes } from ".";

it("returns the body bytes", async () => {
  const server = await startSimpleHttpServer((_request, response) => {
    response.writeHead(200, { "content-type": "image/png" }).end(PNG);
  });
  onTestFinished(() => server.stop());

  const bytes = await fetchBytes(new URL(server.url), options);

  expect(Buffer.isBuffer(bytes)).toBe(true);
  expect(bytes).toEqual(PNG);
});

it("rejects a 500 response", async () => {
  const server = await startFakeHttpServer(() => ({ status: 500 }));
  onTestFinished(() => server.stop());

  await expect(fetchBytes(new URL(server.url), options)).rejects.toThrow();
});

it("rejects a body over the byte limit", async () => {
  const server = await startSimpleHttpServer((_request, response) => {
    response.writeHead(200);
    response.write(PNG.subarray(0, 20));
    response.end(PNG.subarray(20));
  });
  onTestFinished(() => server.stop());

  await expect(
    fetchBytes(new URL(server.url), { ...options, maxBytes: PNG.length - 1 }),
  ).rejects.toThrow();
});

it("rejects after the timeout", async () => {
  const answer = Promise.withResolvers<{ status: number }>();
  const server = await startFakeHttpServer(() => answer.promise);
  onTestFinished(async () => {
    answer.resolve({ status: 200 });
    await server.stop();
  });

  await expect(fetchBytes(new URL(server.url), { ...options, timeoutMs: 50 })).rejects.toThrow();
});

const options = { timeoutMs: 1_000, maxBytes: 1024 };
