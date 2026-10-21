import {
  approveReviewedImport,
  expect,
  PNG,
  SLACK_PHOTO_URL,
  test,
  TEST_OWNER,
} from "#test/support";

test("the setup holder sees and downloads an import employee's photo", async ({ env }) => {
  const browser = env.browser();
  expect((await browser.post("/api/auth/setup/start", undefined)).status).toBe(200);
  const source = await env.seed.importSource();
  const [record] = await env.seed.importEmployees(source.id, [
    { firstName: "Avery", photoUrl: SLACK_PHOTO_URL },
    { firstName: "Robin" },
  ]);
  const fileId = await env.seed.importPhoto(record!.id, {
    photoUrl: SLACK_PHOTO_URL,
    content: PNG,
    mimeType: "image/png",
  });

  const response = await browser.graphql(`query {
    import { id employees { edges { node { id avatarUrl } } } }
  }`);

  expect(response.status).toBe(200);
  const body: unknown = await response.json();
  expect(body).not.toHaveProperty("errors");
  expect(body).toMatchObject({
    data: {
      import: {
        id: "import",
        employees: {
          edges: [
            { node: { avatarUrl: `/api/imports/photos/${fileId}` } },
            { node: { avatarUrl: null } },
          ],
        },
      },
    },
  });
  const image = await browser.get(`/api/imports/photos/${fileId}`);
  expect(image.status).toBe(200);
  expect(image.headers.get("content-type")).toBe("image/png");
  expect(image.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
  expect(Buffer.from(await image.arrayBuffer())).toEqual(PNG);
});

test("keeps the approved import photo until owner setup finishes, then serves it as the employee avatar", async ({
  env,
}) => {
  const browser = await env.startSetupAtImport();
  const source = await env.seed.importSource();
  const [record] = await env.seed.importEmployees(source.id, [{ photoUrl: SLACK_PHOTO_URL }]);
  const fileId = await env.seed.importPhoto(record!.id, {
    photoUrl: SLACK_PHOTO_URL,
    content: PNG,
    mimeType: "image/png",
  });

  const approval = await approveReviewedImport(browser);

  expect(approval.status).toBe(200);
  expect(await approval.json()).toEqual({
    data: { import: { approve: { import: { id: "import" }, error: null } } },
  });
  const review = await browser.graphql(`query {
    setup { id step }
    import { id sources { id } employees { edges { node { id avatarUrl } } } }
  }`);
  expect(await review.json()).toEqual({
    data: {
      setup: { id: "instance", step: "OWNER" },
      import: {
        id: "import",
        sources: [{ id: source.id }],
        employees: {
          edges: [
            {
              node: {
                id: expect.any(String) as unknown,
                avatarUrl: `/api/imports/photos/${fileId}`,
              },
            },
          ],
        },
      },
    },
  });
  const importPhoto = await browser.get(`/api/imports/photos/${fileId}`);
  expect(importPhoto.status).toBe(200);
  expect(Buffer.from(await importPhoto.arrayBuffer())).toEqual(PNG);

  expect((await browser.post("/api/auth/setup", TEST_OWNER)).status).toBe(200);

  const finished = await browser.graphql(`query {
    setup { id step }
    import { id sources { id } employees { edges { node { id } } } }
    employees { edges { node { id avatarUrl } } }
  }`);
  const avatarUrl = `/api/employees/avatar/${fileId}`;
  expect(await finished.json()).toEqual({
    data: {
      setup: { id: "instance", step: "DONE" },
      import: { id: "import", sources: [], employees: { edges: [] } },
      employees: { edges: [{ node: { id: expect.any(String) as unknown, avatarUrl } }] },
    },
  });
  const avatar = await browser.get(avatarUrl);
  expect(avatar.status).toBe(200);
  expect(avatar.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await avatar.arrayBuffer())).toEqual(PNG);
  expect((await browser.get(`/api/imports/photos/${fileId}`)).status).toBe(404);
});

test("returns 404 for an employee avatar at the import photo route", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const fileId = await env.seed.file({ content: PNG, mimeType: "image/png" });
  await env.seed.employee({ avatarFileId: fileId });

  const response = await browser.get(`/api/imports/photos/${fileId}`);

  expect(response.status).toBe(404);
});

test("refuses an import photo without a session", async ({ env }) => {
  const source = await env.seed.importSource();
  const [record] = await env.seed.importEmployees(source.id, [{ photoUrl: SLACK_PHOTO_URL }]);
  const fileId = await env.seed.importPhoto(record!.id, {
    photoUrl: SLACK_PHOTO_URL,
    content: PNG,
    mimeType: "image/png",
  });

  const response = await env.browser().get(`/api/imports/photos/${fileId}`);

  expect(response.status).toBe(401);
});
