import {
  type Browser,
  expect,
  signInAsManagedOwner,
  type FakeDecisions,
  startManagedEnv,
  test,
} from "#test/support";

const CSV = Buffer.from("Name,Email\nAvery Stone,avery@example.com\nRobin Reed,robin@example.com");
const IMPORT = `query {
  import {
    canReadFiles
    sources { id kind name status failure }
    employees { edges { node { firstName lastName email } } }
  }
}`;

test("the managed owner uploads a CSV and its people become mapped import employees", async ({
  fakeDecisions,
}) => {
  const { browser } = await managedImport(fakeDecisions);

  const response = await browser.post("/api/imports/files?name=staff.csv", CSV);

  expect(response.status).toBe(200);
  const { sourceId } = (await response.json()) as { sourceId: string };
  expect(sourceId).toEqual(expect.any(String));
  await expect
    .poll(() => readImport(browser), { timeout: 15_000 })
    .toEqual({
      data: {
        import: {
          canReadFiles: true,
          sources: [
            { id: sourceId, kind: "FILE", name: "staff.csv", status: "MAPPED", failure: null },
          ],
          employees: {
            edges: [
              { node: { firstName: "Avery", lastName: "Stone", email: "avery@example.com" } },
              { node: { firstName: "Robin", lastName: "Reed", email: "robin@example.com" } },
            ],
          },
        },
      },
    });
});

test("the model receives placeholders instead of the file's people and asks for providers that keep nothing", async ({
  fakeDecisions,
}) => {
  const { browser, fake } = await managedImport(fakeDecisions);

  const response = await browser.post("/api/imports/files?name=staff.csv", CSV);

  expect(response.status).toBe(200);
  const { sourceId } = (await response.json()) as { sourceId: string };
  await expect
    .poll(() => readImport(browser), { timeout: 15_000 })
    .toMatchObject({
      data: { import: { sources: [{ id: sourceId, status: "MAPPED" }] } },
    });
  const requests = fake.requests();
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(request).toHaveProperty("provider", { data_collection: "deny", zdr: true });
  }
  const sent = JSON.stringify(requests);
  expect(sent).not.toContain("Avery");
  expect(sent).not.toContain("Stone");
  expect(sent).not.toContain("avery@example.com");
  expect(sent).not.toContain("Robin");
  expect(sent).not.toContain("Reed");
  expect(sent).not.toContain("robin@example.com");
});

test("a failed file becomes mapped after retrying with working decisions", async ({
  fakeDecisions,
}) => {
  const { browser, fake } = await managedImport(fakeDecisions);
  fake.fail(401);
  const response = await browser.post("/api/imports/files?name=staff.csv", CSV);
  expect(response.status).toBe(200);
  const { sourceId } = (await response.json()) as { sourceId: string };
  await expect
    .poll(() => readImport(browser), { timeout: 15_000 })
    .toMatchObject({
      data: {
        import: {
          sources: [{ id: sourceId, status: "FAILED", failure: "UNAVAILABLE" }],
        },
      },
    });
  fake.answer({ headerRow: "1", fullName: "A", email: "B" });

  const retried = await browser.graphql(
    "mutation($id: ID!) { import { retryFile(sourceId: $id) { id } } }",
    { id: sourceId },
  );

  expect(await retried.json()).toEqual({ data: { import: { retryFile: { id: "import" } } } });
  await expect
    .poll(() => readImport(browser), { timeout: 15_000 })
    .toMatchObject({
      data: {
        import: {
          sources: [{ id: sourceId, status: "MAPPED", failure: null }],
          employees: {
            edges: [
              { node: { email: "avery@example.com" } },
              { node: { email: "robin@example.com" } },
            ],
          },
        },
      },
    });
});

test("removeFile removes the uploaded source", async ({ fakeDecisions }) => {
  const { browser } = await managedImport(fakeDecisions);
  const response = await browser.post("/api/imports/files?name=staff.csv", CSV);
  expect(response.status).toBe(200);
  const { sourceId } = (await response.json()) as { sourceId: string };
  await expect
    .poll(() => readImport(browser), { timeout: 15_000 })
    .toMatchObject({
      data: {
        import: {
          sources: [{ id: sourceId, status: "MAPPED" }],
        },
      },
    });

  const removed = await browser.graphql(
    "mutation($id: ID!) { import { removeFile(sourceId: $id) { sources { id } employees { edges { node { id } } } } } }",
    { id: sourceId },
  );

  expect(await removed.json()).toEqual({
    data: {
      import: {
        removeFile: {
          sources: [],
          employees: { edges: [] },
        },
      },
    },
  });
});

test("self-hosted instances cannot read files and refuse uploads", async ({ env }) => {
  const { browser } = await env.signInAsOwner();

  const available = await browser.graphql("query { import { canReadFiles } }");
  const uploaded = await browser.post("/api/imports/files?name=staff.csv", CSV);

  expect(await available.json()).toEqual({ data: { import: { canReadFiles: false } } });
  expect(uploaded.status).toBe(503);
});

test("the upload route refuses a request without a session", async ({ fakeDecisions }) => {
  const { env } = await managedImport(fakeDecisions);

  const response = await env.browser().post("/api/imports/files?name=staff.csv", CSV);

  expect(response.status).toBe(401);
});

test("the upload route refuses files above 5 MB", async ({ fakeDecisions }) => {
  const { browser } = await managedImport(fakeDecisions);

  const response = await browser.post(
    "/api/imports/files?name=staff.csv",
    Buffer.alloc(5 * 1024 * 1024 + 1, "a"),
  );

  expect(response.status).toBe(413);
});

test.for(["", "?name=staff.xlsx"])(
  "the upload route refuses a missing or non-CSV name: %s",
  async (query, { fakeDecisions }) => {
    const { browser } = await managedImport(fakeDecisions);

    const response = await browser.post(`/api/imports/files${query}`, CSV);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "file", code: "not_csv" }],
    });
  },
);

async function managedImport(fake: FakeDecisions) {
  fake.answer({ headerRow: "1", fullName: "A", email: "B" });
  const { env, accounts } = await startManagedEnv({ decisionsUrl: fake.url });
  const browser = await signInAsManagedOwner(env, accounts);
  return { env, browser, fake };
}

async function readImport(browser: Browser): Promise<unknown> {
  return (await browser.graphql(IMPORT)).json();
}
