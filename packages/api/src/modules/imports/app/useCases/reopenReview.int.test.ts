import {
  expect,
  finishSelfHostedSetup,
  importSourceValues,
  importUseCases,
  OWNER,
  PNG,
  SETUP_HOLDER,
  SLACK_PHOTO_URL,
  storedFileIds,
  systemUseCases,
  test,
} from "#test/support";

import { readFile } from "../../../../core/files";
import { readInstance } from "../../../../core/instance";
import { createEmployeeUseCases } from "../../../employees";

test.for(["ready", "owner"] as const)(
  "Back reopens the review from %s",
  async (step, { orm, seed }) => {
    if (step === "ready") await seed.assignment();
    const ctx = step === "ready" ? await seed.owner() : SETUP_HOLDER;
    await seed.setupStep(step);

    await importUseCases(orm).reopenReview(ctx);

    expect((await readInstance(orm)).step).toBe("import");
  },
);

test.for(["company", "import", "done"] as const)(
  "Back at %s leaves setup and employees unchanged",
  async (step, { orm, seed }) => {
    const owner = await seed.owner();
    await seed.setupStep(step);
    const employee = await seed.employee();

    await importUseCases(orm).reopenReview(owner);

    expect((await readInstance(orm)).step).toBe(step);
    expect(
      (await createEmployeeUseCases({ orm }).listEmployees(owner, {})).edges.map(
        ({ node }) => node,
      ),
    ).toEqual([employee]);
  },
);

test("Back preserves values, left-out choices, sources and photos for the next approval", async ({
  orm,
  seed,
}) => {
  await seed.assignment();
  const owner = await seed.owner();
  await seed.setupStep("import");
  const source = await seed.importSource();
  const records = await seed.importEmployees(source.id, [
    { email: "avery@example.com", photoUrl: SLACK_PHOTO_URL },
    { email: "robin@example.com", photoUrl: SLACK_PHOTO_URL },
  ]);
  const photoIds = await Promise.all(
    records.map((record) =>
      seed.importPhoto(record.id, {
        photoUrl: SLACK_PHOTO_URL,
        content: PNG,
        mimeType: "image/png",
      }),
    ),
  );
  await seed.fileSource({ content: "Name\nAvery Stone", status: "mapped" });
  const imports = importUseCases(orm);
  await imports.choices.chooseEmployeeValue(owner, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { value: "Designer" },
  });
  await imports.choices.setLeftOut(owner, { key: "robin@example.com", leftOut: true });
  const review = await imports.reads.readReview(owner);
  const sources = await imports.reads.listSources(owner);
  const fileIds = await storedFileIds(orm);
  await imports.approveImport(owner, review.version);
  const employees = createEmployeeUseCases({ orm });
  expect((await employees.listEmployees(owner, {})).edges).toEqual([]);

  await imports.reopenReview(owner);

  expect((await imports.reads.readReview(owner)).listEmployees({})).toEqual(
    review.listEmployees({}),
  );
  expect((await imports.reads.listSources(owner)).map(importSourceValues)).toEqual(
    sources.map(importSourceValues),
  );
  expect(await storedFileIds(orm)).toEqual(fileIds);
  for (const photoId of photoIds) {
    expect(await readFile(orm, photoId)).toEqual({ content: PNG, mimeType: "image/png" });
  }
  await imports.choices.setLeftOut(owner, { key: "robin@example.com", leftOut: false });
  await imports.choices.chooseEmployeeValue(owner, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { value: "Engineer" },
  });
  await imports.approveImport(owner, (await imports.reads.readReview(owner)).version);
  await systemUseCases(orm).completeSetup(owner);

  expect(
    (await employees.listEmployees(owner, { orderBy: { field: "EMAIL" } })).edges.map(
      ({ node }) => ({
        email: node.email,
        jobTitle: node.jobTitle,
        avatarFileId: node.avatarFileId,
      }),
    ),
  ).toEqual([
    { email: "avery@example.com", jobTitle: "Engineer", avatarFileId: photoIds[0] },
    { email: "robin@example.com", jobTitle: null, avatarFileId: photoIds[1] },
  ]);
});

test("Back from the terminal demo deletes demo employees and finishes with only the new import", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("import");
  const imports = importUseCases(orm);
  await imports.startDemo(SETUP_HOLDER);
  const employees = createEmployeeUseCases({ orm });
  expect((await employees.listEmployees(OWNER, {})).edges.length).toBeGreaterThan(0);
  expect((await readInstance(orm)).step).toBe("owner");

  await imports.reopenReview(SETUP_HOLDER);

  expect((await readInstance(orm)).step).toBe("import");
  expect((await employees.listEmployees(OWNER, {})).edges).toEqual([]);
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  await imports.approveImport(SETUP_HOLDER, (await imports.reads.readReview(SETUP_HOLDER)).version);
  await finishSelfHostedSetup(orm);
  expect((await employees.listEmployees(OWNER, {})).edges.map(({ node }) => node.email)).toEqual([
    "avery@example.com",
  ]);
});
