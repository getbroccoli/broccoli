import { expect, importUseCases, SETUP_HOLDER, test } from "#test/support";

test("offers the demo and reads nothing for an empty import", async ({ orm }) => {
  const imports = importUseCases(orm);

  const progress = await imports.reads.readProgress(SETUP_HOLDER);

  expect(progress).toEqual({ reading: false, demoAvailable: true });
});

test("reports a file being read and leaves the demo unavailable", async ({ orm, seed }) => {
  await seed.fileSource({ content: "Name\nAvery Stone" });
  const imports = importUseCases(orm);

  const progress = await imports.reads.readProgress(SETUP_HOLDER);

  expect(progress).toEqual({ reading: true, demoAvailable: false });
});

test("leaves the demo unavailable when a source has people", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{}]);
  const imports = importUseCases(orm);

  const progress = await imports.reads.readProgress(SETUP_HOLDER);

  expect(progress).toEqual({ reading: false, demoAvailable: false });
});
