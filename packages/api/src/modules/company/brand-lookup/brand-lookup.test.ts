import { expect, it, onTestFinished, vi } from "vitest";

import { startFakeBrandServer } from "#test/support";

import { createBrandLookup } from "..";

it("parses a brand name and logo from a successful response", async () => {
  const logo = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
    "hex",
  );
  const server = await startFakeBrandServer(() => ({
    status: 200,
    body: {
      name: "Example Labs",
      logo: { contentType: "image/png", base64: logo.toString("base64") },
    },
  }));
  onTestFinished(() => server.stop());

  const brand = await createBrandLookup(server.url)("example.com");

  expect(brand).toEqual({ name: "Example Labs", logo });
  expect(server.requests).toEqual(["example.com"]);
});

it("returns null when no brand is found", async () => {
  const server = await startFakeBrandServer(() => ({ status: 404 }));
  onTestFinished(() => server.stop());

  await expect(createBrandLookup(server.url)("example.com")).resolves.toBeNull();
});

it("rejects a failed response", async () => {
  const server = await startFakeBrandServer(() => ({ status: 500 }));
  onTestFinished(() => server.stop());

  await expect(createBrandLookup(server.url)("example.com")).rejects.toThrow();
});

it("rejects when the service does not answer before the timeout", async () => {
  const answer = Promise.withResolvers<{ status: number }>();
  const server = await startFakeBrandServer(() => answer.promise);
  onTestFinished(async () => {
    answer.resolve({ status: 404 });
    await server.stop();
  });

  await expect(createBrandLookup(server.url, { timeoutMs: 50 })("example.com")).rejects.toThrow();
});

it("returns null without requesting a brand when disabled", async () => {
  const request = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Unexpected HTTP request"));
  onTestFinished(() => request.mockRestore());

  await expect(createBrandLookup(null)("example.com")).resolves.toBeNull();

  expect(request).not.toHaveBeenCalled();
});
