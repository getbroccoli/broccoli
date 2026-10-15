import { onTestFinished } from "vitest";

import {
  type Browser,
  expect,
  signInAsManagedOwner,
  startFakeDecisions,
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

test("the managed owner uploads a CSV and its people become mapped import employees", async () => {
  const { browser } = await managedImport();

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

test("a failed file becomes mapped after retrying with working decisions", async () => {
  const { browser, fake } = await managedImport();
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

test("removeFile removes the uploaded source", async () => {
  const { browser } = await managedImport();
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

test("the upload route refuses a request without a session", async () => {
  const { env } = await managedImport();

  const response = await env.browser().post("/api/imports/files?name=staff.csv", CSV);

  expect(response.status).toBe(401);
});

test("the upload route refuses files above 5 MB", async () => {
  const { browser } = await managedImport();

  const response = await browser.post(
    "/api/imports/files?name=staff.csv",
    Buffer.alloc(5 * 1024 * 1024 + 1, "a"),
  );

  expect(response.status).toBe(413);
});

test.each(["", "?name=staff.xlsx"])(
  "the upload route refuses a missing or non-CSV name: %s",
  async (query) => {
    const { browser } = await managedImport();

    const response = await browser.post(`/api/imports/files${query}`, CSV);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "file", code: "not_csv" }],
    });
  },
);

async function managedImport() {
  const fake = await startFakeDecisions();
  onTestFinished(() => fake.stop());
  fake.answer({ headerRow: "1", fullName: "A", email: "B" });
  const { env, accounts } = await startManagedEnv({ decisionsUrl: fake.url });
  const browser = await signInAsManagedOwner(env, accounts);
  return { env, browser, fake };
}

async function readImport(browser: Browser): Promise<unknown> {
  return (await browser.graphql(IMPORT)).json();
}
