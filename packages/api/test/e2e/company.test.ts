import { onTestFinished } from "vitest";

import { expect, startFakeBrandServer, TestEnv, test } from "#test/support";

test("completes setup when the owner names the company", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const before = await browser.graphql("query { setup { id step } company { id suggestedName } }");
  expect(before.status).toBe(200);
  expect(await before.json()).toEqual({
    data: {
      setup: { id: "instance", step: "COMPANY" },
      company: { id: "company", suggestedName: "Example" },
    },
  });

  const saved = await browser.graphql(`
    mutation { company { setName(name: "Example Ltd") { id name } } }
  `);

  expect(saved.status).toBe(200);
  expect(await saved.json()).toEqual({
    data: {
      company: { setName: { id: "company", name: "Example Ltd" } },
    },
  });
  const after = await browser.graphql("query { setup { id step } }");
  expect(await after.json()).toEqual({ data: { setup: { id: "instance", step: "DONE" } } });
});

test("serves the looked-up logo to the owner with private caching", async () => {
  const logo = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
    "hex",
  );
  const brands = await startFakeBrandServer(() => ({
    status: 200,
    body: {
      name: "Example Labs",
      logo: { contentType: "image/png", base64: logo.toString("base64") },
    },
  }));
  onTestFinished(() => brands.stop());
  const env = await TestEnv.start({ brandLookupUrl: brands.url });
  onTestFinished(() => env.stop());
  const { browser } = await env.signInAsOwner();

  const response = await browser.graphql("query { company { id suggestedName logoUrl } }");
  const body = (await response.json()) as {
    data: { company: { id: string; suggestedName: string; logoUrl: string } };
  };

  expect(response.status).toBe(200);
  expect(body).not.toHaveProperty("errors");
  expect(body.data.company).toMatchObject({ id: "company", suggestedName: "Example Labs" });
  expect(body.data.company.logoUrl).toMatch(/^\/api\/company\/logo\/[0-9a-f-]+$/);
  expect(brands.requests).toEqual(["example.com"]);
  const image = await browser.get(body.data.company.logoUrl);
  expect(image.status).toBe(200);
  expect(Buffer.from(await image.arrayBuffer())).toEqual(logo);
  expect(image.headers.get("content-type")).toBe("image/png");
  expect(image.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
  expect(image.headers.get("x-content-type-options")).toBe("nosniff");

  const anonymous = await env.browser().get(body.data.company.logoUrl);
  expect(anonymous.status).toBe(401);
});
