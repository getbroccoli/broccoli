import { expect, test, WEBP } from "#test/support";

interface DemoDataResponse {
  data: {
    employees: { edges: { node: { avatarUrl: string | null } }[] };
    demo: { id: string; isPresent: boolean };
  };
}

const saveCompany = `mutation { company { update(input: { name: "Acme Corp" }) { id } } }`;
const demoQuery = `query {
  employees(first: 100) { edges { node { avatarUrl } } }
  demo { id isPresent }
}`;

test("fills the directory and serves demo avatars when setup completes", async ({ env }) => {
  const { browser } = await env.signInAsOwner();

  const saved = await browser.graphql(saveCompany);

  expect(await saved.json()).toEqual({ data: { company: { update: { id: "company" } } } });
  await browser.graphql("mutation { import { skip { id } } }");
  const response = await browser.graphql(demoQuery);
  const body = (await response.json()) as DemoDataResponse;
  expect(response.status).toBe(200);
  expect(body).not.toHaveProperty("errors");
  expect(body.data.employees.edges).toHaveLength(40);
  expect(body.data.demo).toEqual({ id: "demoData", isPresent: true });
  const avatarUrl = body.data.employees.edges[0]!.node.avatarUrl!;
  expect(avatarUrl).toMatch(/^\/api\/employees\/avatar\/[0-9a-f-]+$/);
  const image = await browser.get(avatarUrl);
  expect(image.status).toBe(200);
  expect(image.headers.get("content-type")).toBe("image/webp");
  expect(image.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
  const bytes = Buffer.from(await image.arrayBuffer());
  expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
  expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
});

test("clears demo data through the API and stops serving its avatars", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  await browser.graphql(saveCompany);
  await browser.graphql("mutation { import { skip { id } } }");
  const before = await browser.graphql(demoQuery);
  const body = (await before.json()) as DemoDataResponse;
  expect(body).not.toHaveProperty("errors");
  const avatarUrl = body.data.employees.edges[0]!.node.avatarUrl!;
  expect((await browser.get(avatarUrl)).status).toBe(200);

  const cleared = await browser.graphql("mutation { demo { clear { id isPresent } } }");

  expect(cleared.status).toBe(200);
  expect(await cleared.json()).toEqual({
    data: { demo: { clear: { id: "demoData", isPresent: false } } },
  });
  const after = await browser.graphql(demoQuery);
  expect(await after.json()).toEqual({
    data: { employees: { edges: [] }, demo: { id: "demoData", isPresent: false } },
  });
  expect((await browser.get(avatarUrl)).status).toBe(404);
});

test("refuses demo data and employee avatars without a session", async ({ env }) => {
  const avatarFileId = await env.seed.file({ content: WEBP, mimeType: "image/webp" });
  await env.seed.employee({ avatarFileId });
  const browser = env.browser();

  const response = await browser.graphql("query { demo { isPresent } }");
  const cleared = await browser.graphql("mutation { demo { clear { id isPresent } } }");
  const image = await browser.get(`/api/employees/avatar/${avatarFileId}`);

  expect(await response.json()).toMatchObject({
    errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
  });
  expect(await cleared.json()).toMatchObject({
    errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
  });
  expect(image.status).toBe(401);
});
