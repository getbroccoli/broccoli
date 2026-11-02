import {
  importSourceValues,
  expect,
  importServices,
  OWNER,
  PNG,
  SETUP_HOLDER,
  SLACK_PHOTO_URL,
  slackServices,
  storedFileIds,
  test,
} from "#test/support";

import { createInstanceService } from "../../../core/instance";

const instances = createInstanceService();

test("removes the source, its records and its stored file", async ({ orm, seed }) => {
  const source = await seed.fileSource({ content: "Name\nAvery Stone", status: "mapped" });
  await seed.importEmployees(source.id, [{ firstName: "Avery", lastName: "Stone" }]);
  const otherFile = await seed.file({ content: Buffer.from("keep"), mimeType: "text/plain" });
  const imports = importServices(orm);

  await imports.removeSource(OWNER, source.id);

  expect(await imports.reads.listSources(OWNER)).toEqual([]);
  expect((await imports.reads.readReview(OWNER)).listEmployees({}).edges).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([otherFile]);
});

test("refuses file removal after Approve and keeps the import and stored file unchanged", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("import");
  const source = await seed.fileSource({ content: "Name\nAvery Stone", status: "mapped" });
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const imports = importServices(orm);
  await imports.approveImport(SETUP_HOLDER, (await imports.reads.readReview(SETUP_HOLDER)).version);
  expect((await instances.readInstance(orm)).step).toBe("owner");
  const before = (await imports.reads.readReview(SETUP_HOLDER)).listEmployees({});
  const fileIds = await storedFileIds(orm);
  expect(before.edges).toHaveLength(1);
  expect(fileIds).toHaveLength(1);

  await expect(imports.removeSource(SETUP_HOLDER, source.id)).rejects.toMatchObject({
    code: "CONFLICT",
  });

  expect((await imports.reads.listSources(SETUP_HOLDER)).map(importSourceValues)).toEqual([
    importSourceValues(source),
  ]);
  expect((await imports.reads.readReview(SETUP_HOLDER)).listEmployees({})).toEqual(before);
  expect(await storedFileIds(orm)).toEqual(fileIds);
});

test("removes a Slack source, its records and their photos, and disconnects Slack", async ({
  orm,
  seed,
}) => {
  await seed.slackConnection();
  const source = await seed.importSource();
  const [record] = await seed.importEmployees(source.id, [{ photoUrl: SLACK_PHOTO_URL }]);
  await seed.importPhoto(record!.id, {
    photoUrl: SLACK_PHOTO_URL,
    content: PNG,
    mimeType: "image/png",
  });
  const otherFile = await seed.file({ content: Buffer.from("keep"), mimeType: "text/plain" });
  const imports = importServices(orm);

  await imports.removeSource(OWNER, source.id);

  expect(await imports.reads.listSources(OWNER)).toEqual([]);
  expect((await imports.reads.readReview(OWNER)).listEmployees({}).edges).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([otherFile]);
  expect(await slackServices(orm).getSlackConnection(OWNER)).toBeNull();
});

test("removing a file source keeps the Slack source, its records and its connection", async ({
  orm,
  seed,
}) => {
  await seed.slackConnection();
  const slackSource = await seed.importSource();
  const records = await seed.importEmployees(slackSource.id, [{ firstName: "Avery" }]);
  const fileSource = await seed.fileSource({ content: "Name\nRobin Reed", status: "mapped" });
  await seed.importEmployees(fileSource.id, [{ firstName: "Robin" }]);
  const imports = importServices(orm);
  const slack = slackServices(orm);
  const connection = await slack.getSlackConnection(OWNER);

  await imports.removeSource(OWNER, fileSource.id);

  expect((await imports.reads.listSources(OWNER)).map(importSourceValues)).toEqual([
    importSourceValues(slackSource),
  ]);
  expect(
    (await imports.reads.listEmployeeRecords(OWNER, { sourceId: slackSource.id })).edges.map(
      ({ node }) => node,
    ),
  ).toEqual(records);
  expect(await slack.getSlackConnection(OWNER)).toEqual(connection);
  expect(await storedFileIds(orm)).toEqual([]);
});

test("refuses Slack removal after Approve and keeps the import, photos and connection unchanged", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("import");
  await seed.slackConnection();
  const source = await seed.importSource();
  const [record] = await seed.importEmployees(source.id, [{ photoUrl: SLACK_PHOTO_URL }]);
  await seed.importPhoto(record!.id, {
    photoUrl: SLACK_PHOTO_URL,
    content: PNG,
    mimeType: "image/png",
  });
  const imports = importServices(orm);
  const slack = slackServices(orm);
  await imports.approveImport(SETUP_HOLDER, (await imports.reads.readReview(SETUP_HOLDER)).version);
  expect((await instances.readInstance(orm)).step).toBe("owner");
  const before = (await imports.reads.readReview(SETUP_HOLDER)).listEmployees({});
  const fileIds = await storedFileIds(orm);
  const connection = await slack.getSlackConnection(SETUP_HOLDER);

  await expect(imports.removeSource(SETUP_HOLDER, source.id)).rejects.toMatchObject({
    code: "CONFLICT",
  });

  expect((await imports.reads.listSources(SETUP_HOLDER)).map(importSourceValues)).toEqual([
    importSourceValues(source),
  ]);
  expect((await imports.reads.readReview(SETUP_HOLDER)).listEmployees({})).toEqual(before);
  expect(await storedFileIds(orm)).toEqual(fileIds);
  expect(await slack.getSlackConnection(SETUP_HOLDER)).toEqual(connection);
});

test("removing a missing source leaves the import and Slack connection unchanged", async ({
  orm,
  seed,
}) => {
  await seed.slackConnection();
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ firstName: "Avery" }]);
  const imports = importServices(orm);
  const slack = slackServices(orm);
  const before = (await imports.reads.readReview(OWNER)).listEmployees({});
  const connection = await slack.getSlackConnection(OWNER);

  await imports.removeSource(OWNER, "0199f6c4-0000-7000-8000-000000000000");

  expect((await imports.reads.listSources(OWNER)).map(importSourceValues)).toEqual([
    importSourceValues(source),
  ]);
  expect((await imports.reads.readReview(OWNER)).listEmployees({})).toEqual(before);
  expect(await slack.getSlackConnection(OWNER)).toEqual(connection);
});
