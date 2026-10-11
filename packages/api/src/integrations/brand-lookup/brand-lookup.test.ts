import { expect, it, onTestFinished } from "vitest";

import { startFakeHttpServer } from "#test/support";

import { createBrandLookup } from ".";

it("parses a brand name and logo from a successful response", async () => {
  const logo = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
    "hex",
  );
  const server = await startFakeHttpServer(() => ({
    status: 200,
    body: {
      name: "Example Labs",
      logo: { contentType: "image/png", base64: logo.toString("base64") },
    },
  }));
  onTestFinished(() => server.stop());

  const brand = await createBrandLookup(server.url)("example.com");

  expect(brand).toEqual({ name: "Example Labs", logo });
  expect(server.paths).toEqual(["/brands/example.com"]);
});

it("returns null when disabled", async () => {
  await expect(createBrandLookup(null)("example.com")).resolves.toBeNull();
});
