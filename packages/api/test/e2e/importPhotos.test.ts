import { expect, PNG, SLACK_PHOTO_URL, test } from "#test/support";

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
