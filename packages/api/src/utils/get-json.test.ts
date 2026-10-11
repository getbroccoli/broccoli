import { expect, it, onTestFinished } from "vitest";
import { z } from "zod";

import { startFakeHttpServer } from "#test/support";

import { getJson } from ".";

const schema = z.object({ name: z.string() });
const options = { timeoutMs: 1_000, maxBytes: 1024 };

it("parses a successful response matching the schema", async () => {
  const server = await startFakeHttpServer(() => ({ status: 200, body: { name: "Example" } }));
  onTestFinished(() => server.stop());

  await expect(getJson(new URL(server.url), schema, options)).resolves.toEqual({ name: "Example" });
});

it("returns null for a 404 response", async () => {
  const server = await startFakeHttpServer(() => ({ status: 404 }));
  onTestFinished(() => server.stop());

  await expect(getJson(new URL(server.url), schema, options)).resolves.toBeNull();
});

it("rejects a 500 response", async () => {
  const server = await startFakeHttpServer(() => ({ status: 500 }));
  onTestFinished(() => server.stop());

  await expect(getJson(new URL(server.url), schema, options)).rejects.toThrow();
});

it("rejects when the answer exceeds the timeout", async () => {
  const answer = Promise.withResolvers<{ status: number }>();
  const server = await startFakeHttpServer(() => answer.promise);
  onTestFinished(async () => {
    answer.resolve({ status: 404 });
    await server.stop();
  });

  await expect(
    getJson(new URL(server.url), schema, { ...options, timeoutMs: 50 }),
  ).rejects.toThrow();
});

it("rejects a body over the byte limit", async () => {
  const server = await startFakeHttpServer(() => ({
    status: 200,
    body: JSON.stringify({ name: "é".repeat(20) }),
  }));
  onTestFinished(() => server.stop());

  await expect(
    getJson(new URL(server.url), schema, { ...options, maxBytes: 40 }),
  ).rejects.toThrow();
});

it("rejects invalid JSON", async () => {
  const server = await startFakeHttpServer(() => ({ status: 200, body: "not JSON" }));
  onTestFinished(() => server.stop());

  await expect(getJson(new URL(server.url), schema, options)).rejects.toThrow();
});

it("rejects a successful response that does not match the schema", async () => {
  const server = await startFakeHttpServer(() => ({ status: 200, body: { name: 123 } }));
  onTestFinished(() => server.stop());

  await expect(getJson(new URL(server.url), schema, options)).rejects.toThrow();
});
