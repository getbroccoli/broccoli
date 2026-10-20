import {
  type Browser,
  expect,
  signInAsManagedOwner,
  type FakeDecisions,
  startManagedEnv,
  test,
  samplePdfFile,
  sampleXlsxFile,
} from "#test/support";

const CSV = Buffer.from("Name,Email\nAvery Stone,avery@example.com\nRobin Reed,robin@example.com");
const IMPORT = `query {
  import {
    sources { id kind name status failure }
    employees { edges { node { firstName { value } lastName { value } email { value } } } }
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
          sources: [
            { id: sourceId, kind: "FILE", name: "staff.csv", status: "MAPPED", failure: null },
          ],
          employees: {
            edges: [
              employee("Avery", "Stone", "avery@example.com"),
              employee("Robin", "Reed", "robin@example.com"),
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

test("imports PDF people while keeping their details from the model", async ({ fakeDecisions }) => {
  const { browser, fake } = await managedImport(fakeDecisions);
  const bytes = samplePdfFile({
    pages: [
      ["Avery Stone", "avery@example.com"],
      ["Robin Reed", "robin@example.com"],
    ].map((cells) => ({
      texts: [
        { text: "Name", x: 40, y: 760 },
        { text: "Email", x: 200, y: 760 },
        ...cells.map((text, index) => ({ text, x: 40 + index * 160, y: 740 })),
      ],
    })),
  });

  const response = await browser.post("/api/imports/files?name=staff.pdf", Buffer.from(bytes));

  expect(response.status).toBe(200);
  const { sourceId } = (await response.json()) as { sourceId: string };
  await expect
    .poll(() => readImport(browser), { timeout: 15_000 })
    .toMatchObject({
      data: {
        import: {
          sources: [{ id: sourceId, status: "MAPPED" }],
          employees: {
            edges: [
              { node: { firstName: "Avery", lastName: "Stone", email: "avery@example.com" } },
              { node: { firstName: "Robin", lastName: "Reed", email: "robin@example.com" } },
            ],
          },
        },
      },
    });
  const requests = fake.requests();
  expect(requests.length).toBeGreaterThan(0);
  const sent = JSON.stringify(requests);
  expect(sent).not.toMatch(/Avery|Stone|avery@example\.com|Robin|Reed|robin@example\.com/);
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
    "mutation($id: ID!) { import { retryFile(sourceId: $id) { import { id } error { __typename ... on Error { message } } } } }",
    { id: sourceId },
  );

  expect(await retried.json()).toEqual({
    data: { import: { retryFile: { import: { id: "import" }, error: null } } },
  });
  await expect
    .poll(() => readImport(browser), { timeout: 15_000 })
    .toMatchObject({
      data: {
        import: {
          sources: [{ id: sourceId, status: "MAPPED", failure: null }],
          employees: {
            edges: [
              { node: { email: { value: "avery@example.com" } } },
              { node: { email: { value: "robin@example.com" } } },
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
    "mutation($id: ID!) { import { removeFile(sourceId: $id) { import { sources { id } employees { edges { node { id } } } } } } }",
    { id: sourceId },
  );

  expect(await removed.json()).toEqual({
    data: {
      import: {
        removeFile: {
          import: { sources: [], employees: { edges: [] } },
        },
      },
    },
  });
});

test("returns an approval conflict in the payload while a file is mapping", async ({ env }) => {
  const browser = await env.startSetupAtImport();
  await env.seed.fileSource({ content: CSV.toString(), status: "mapping" });

  const response = await browser.graphql(`
    mutation {
      import {
        approve {
          import { id }
          error { __typename ... on Error { message } }
        }
      }
    }
  `);

  expect(await response.json()).toEqual({
    data: {
      import: {
        approve: {
          import: null,
          error: { __typename: "ConflictError", message: "Files are still being read." },
        },
      },
    },
  });
});

test("the upload route refuses a request without a session", async ({ fakeDecisions }) => {
  const { env } = await managedImport(fakeDecisions);

  const response = await env.browser().post("/api/imports/files?name=staff.csv", CSV);

  expect(response.status).toBe(401);
});

test("the upload route refuses an oversized request without a session as unauthenticated", async ({
  fakeDecisions,
}) => {
  const { env } = await managedImport(fakeDecisions);

  const response = await env
    .browser()
    .post("/api/imports/files?name=staff.csv", Buffer.alloc(5 * 1024 * 1024 + 1, "a"));

  expect(response.status).toBe(401);
});

test("the upload route limits a signed-in user to 30 requests per minute", async ({
  fakeDecisions,
}) => {
  const { browser } = await managedImport(fakeDecisions);
  for (let request = 0; request < 30; request++) {
    const response = await browser.post("/api/imports/files?name=staff.txt", CSV);
    expect(response.status).toBe(400);
  }

  const response = await browser.post("/api/imports/files?name=staff.txt", CSV);

  expect(response.status).toBe(429);
});

test("the upload route refuses files above 5 MB", async ({ fakeDecisions }) => {
  const { browser } = await managedImport(fakeDecisions);

  const response = await browser.post(
    "/api/imports/files?name=staff.csv",
    Buffer.alloc(5 * 1024 * 1024 + 1, "a"),
  );

  expect(response.status).toBe(413);
});

test.for(["", "?name=staff.xls"])(
  "the upload route refuses a missing or unsupported name: %s",
  async (query, { fakeDecisions }) => {
    const { browser } = await managedImport(fakeDecisions);

    const response = await browser.post(`/api/imports/files${query}`, CSV);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "file", code: "unsupported_file" }],
    });
  },
);

test.for(["staff.xlsx", "staff.XLSX"])(
  "the managed owner uploads %s and its people become mapped import employees",
  async (name, { fakeDecisions }) => {
    const { browser } = await managedImport(fakeDecisions);
    const bytes = sampleXlsxFile({
      sheets: [
        {
          name: "Staff",
          rows: [
            ["Name", "Email"],
            ["Avery Stone", "avery@example.com"],
            ["Robin Reed", "robin@example.com"],
          ],
        },
      ],
    });

    const response = await browser.post(`/api/imports/files?name=${name}`, Buffer.from(bytes));

    expect(response.status).toBe(200);
    const { sourceId } = (await response.json()) as { sourceId: string };
    expect(sourceId).toEqual(expect.any(String));
    await expect
      .poll(() => readImport(browser), { timeout: 15_000 })
      .toEqual({
        data: {
          import: {
            sources: [{ id: sourceId, kind: "FILE", name, status: "MAPPED", failure: null }],
            employees: {
              edges: [
                employee("Avery", "Stone", "avery@example.com"),
                employee("Robin", "Reed", "robin@example.com"),
              ],
            },
          },
        },
      });
  },
);

test("refuses a file upload from another origin with a valid setup cookie and adds no source", async ({
  env,
}) => {
  const browser = env.browser();
  const started = await browser.post("/api/auth/setup/start", undefined);
  expect(started.status).toBe(200);
  const cookie = started.headers
    .getSetCookie()
    .find((value) => value.startsWith("broccoli_setup="))!
    .split(";", 1)[0]!;

  const response = await fetch(`${env.url}/api/imports/files?name=staff.csv`, {
    method: "POST",
    headers: { origin: "https://other.example.com", cookie, "content-type": "text/plain" },
    body: CSV,
  });

  expect(response.status).toBe(401);
  expect(await response.text()).toBe("Unauthorized");
  const sources = await browser.graphql("query { import { id sources { id } } }");
  expect(await sources.json()).toEqual({ data: { import: { id: "import", sources: [] } } });
});

async function managedImport(fake: FakeDecisions) {
  fake.answer({ headerRow: "1", fullName: "A", email: "B" });
  const { env, accounts } = await startManagedEnv({ decisionsUrl: fake.url });
  const browser = await signInAsManagedOwner(env, accounts);
  return { env, browser, fake };
}

async function readImport(browser: Browser): Promise<unknown> {
  return (await browser.graphql(IMPORT)).json();
}

/** An import employee's edge as `IMPORT` selects it. */
function employee(firstName: string, lastName: string, email: string) {
  return {
    node: {
      firstName: { value: firstName },
      lastName: { value: lastName },
      email: { value: email },
    },
  };
}
