import { onTestFinished } from "vitest";

import { expect, PNG as logo, startFakeBrandServer, TestEnv, test } from "#test/support";

test("advances to import when the owner names the company", async ({ env }) => {
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
    mutation { company { update(input: { name: "Example Ltd" }) { company { id name } error { __typename ... on Error { message } ... on InvalidInputError { fields { field code } } } } } }
  `);

  expect(saved.status).toBe(200);
  expect(await saved.json()).toEqual({
    data: {
      company: { update: { company: { id: "company", name: "Example Ltd" }, error: null } },
    },
  });
  const after = await browser.graphql("query { setup { id step } }");
  expect(await after.json()).toEqual({ data: { setup: { id: "instance", step: "IMPORT" } } });
});

test("returns invalid company input in the mutation payload", async ({ env }) => {
  const { browser } = await env.signInAsOwner();

  const response = await browser.graphql(`
    mutation {
      company {
        update(input: { name: "" }) {
          company { id }
          error {
            __typename
            ... on Error { message }
            ... on InvalidInputError { fields { field code } }
          }
        }
      }
    }
  `);

  expect(await response.json()).toEqual({
    data: {
      company: {
        update: {
          company: null,
          error: {
            __typename: "InvalidInputError",
            message: "The input is invalid.",
            fields: [{ field: "name", code: "required" }],
          },
        },
      },
    },
  });
});

test("removes the company logo through the mutation payload", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const uploaded = await browser.put("/api/company/logo", logo);
  expect(uploaded.status).toBe(200);

  const response = await browser.graphql(`
    mutation { company { removeLogo { company { id logoUrl } } } }
  `);

  expect(await response.json()).toEqual({
    data: { company: { removeLogo: { company: { id: "company", logoUrl: null } } } },
  });
});

test("serves the looked-up logo to the owner with private caching", async () => {
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

test("serves the logo uploaded by the owner", async ({ env }) => {
  const { browser } = await env.signInAsOwner();

  const response = await browser.put("/api/company/logo", logo);

  expect(response.status).toBe(200);
  const body = (await response.json()) as { logoUrl: string };
  expect(body.logoUrl).toMatch(/^\/api\/company\/logo\/[0-9a-f-]+$/);
  const image = await browser.get(body.logoUrl);
  expect(image.status).toBe(200);
  expect(Buffer.from(await image.arrayBuffer())).toEqual(logo);
});

test("accepts and serves a logo larger than 512 KB", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const jpeg = Buffer.alloc(512 * 1024 + 1);
  jpeg.set([0xff, 0xd8, 0xff]);
  jpeg.set([0xff, 0xd9], jpeg.length - 2);

  const response = await browser.put("/api/company/logo", jpeg);

  expect(response.status).toBe(200);
  const body = (await response.json()) as { logoUrl: string };
  const image = await browser.get(body.logoUrl);
  expect(image.status).toBe(200);
  expect(Buffer.from(await image.arrayBuffer())).toEqual(jpeg);
});

test("refuses invalid, oversized and anonymous logo uploads", async ({ env }) => {
  const { browser } = await env.signInAsOwner();

  const invalid = await browser.put(
    "/api/company/logo",
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  );
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toEqual({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "logo", code: "invalid" }],
  });

  const oversized = await browser.put("/api/company/logo", Buffer.alloc(5 * 1024 * 1024 + 1));
  expect(oversized.status).toBe(413);

  const anonymous = await env.browser().put("/api/company/logo", logo);
  expect(anonymous.status).toBe(401);
});

test("returns 404 for the first logo URL after the owner uploads a second logo", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();
  const first = await browser.put("/api/company/logo", logo);
  expect(first.status).toBe(200);
  const { logoUrl: firstLogoUrl } = (await first.json()) as { logoUrl: string };
  expect((await browser.get(firstLogoUrl)).status).toBe(200);

  const second = await browser.put("/api/company/logo", logo);

  expect(second.status).toBe(200);
  expect((await browser.get(firstLogoUrl)).status).toBe(404);
});
