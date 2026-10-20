import { expect, it, onTestFinished } from "vitest";
import { z } from "zod";

import { startFakeHttpServer, startSimpleHttpServer } from "#test/support";

import { fetchJson, FetchStatusError } from ".";

const schema = z.object({ name: z.string() });
const options = { timeoutMs: 1_000, maxBytes: 1024 };

it("parses a successful response matching the schema", async () => {
  const server = await startFakeHttpServer(() => ({ status: 200, body: { name: "Example" } }));
  onTestFinished(() => server.stop());

  await expect(fetchJson(new URL(server.url), schema, options)).resolves.toEqual({
    name: "Example",
  });
});

it("returns null for a 404 response", async () => {
  const server = await startFakeHttpServer(() => ({ status: 404 }));
  onTestFinished(() => server.stop());

  await expect(fetchJson(new URL(server.url), schema, options)).resolves.toBeNull();
});

it.each([401, 429, 500])("reports the unsuccessful HTTP status %s", async (status) => {
  const server = await startFakeHttpServer(() => ({ status }));
  onTestFinished(() => server.stop());

  const request = fetchJson(new URL(server.url), schema, options);

  await expect(request).rejects.toBeInstanceOf(FetchStatusError);
  await expect(request).rejects.toMatchObject({ status });
});

it("ends an in-flight HTTP request when its caller aborts", async () => {
  const received = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<void>();
  const server = await startSimpleHttpServer((_request, response) => {
    response.once("close", closed.resolve);
    received.resolve();
  });
  const controller = new AbortController();
  onTestFinished(async () => {
    controller.abort();
    await server.stop();
  });
  const request = fetchJson(new URL(server.url), schema, {
    ...options,
    timeoutMs: 30_000,
    signal: controller.signal,
  });
  await received.promise;
  const reason = new Error("Request cancelled");
  const rejected = expect(request).rejects.toBe(reason);

  controller.abort(reason);

  await rejected;
  await closed.promise;
});

it("rejects when the answer exceeds the timeout", async () => {
  const answer = Promise.withResolvers<{ status: number }>();
  const server = await startFakeHttpServer(() => answer.promise);
  onTestFinished(async () => {
    answer.resolve({ status: 404 });
    await server.stop();
  });

  await expect(
    fetchJson(new URL(server.url), schema, { ...options, timeoutMs: 50 }),
  ).rejects.toThrow();
});

it("rejects a body over the byte limit", async () => {
  const server = await startFakeHttpServer(() => ({
    status: 200,
    body: JSON.stringify({ name: "é".repeat(20) }),
  }));
  onTestFinished(() => server.stop());

  await expect(
    fetchJson(new URL(server.url), schema, { ...options, maxBytes: 40 }),
  ).rejects.toThrow();
});

it("rejects invalid JSON", async () => {
  const server = await startFakeHttpServer(() => ({ status: 200, body: "not JSON" }));
  onTestFinished(() => server.stop());

  await expect(fetchJson(new URL(server.url), schema, options)).rejects.toThrow();
});

it("rejects a successful response that does not match the schema", async () => {
  const server = await startFakeHttpServer(() => ({ status: 200, body: { name: 123 } }));
  onTestFinished(() => server.stop());

  await expect(fetchJson(new URL(server.url), schema, options)).rejects.toThrow();
});
