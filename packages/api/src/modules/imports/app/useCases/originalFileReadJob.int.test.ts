import assert from "node:assert/strict";

import {
  expect,
  importUseCases,
  SETUP_HOLDER,
  SYSTEM,
  test,
  STAFF_CSV as CSV,
  READ_PEOPLE as PEOPLE,
  sampleXlsxFile,
  STAFF_PDF as PDF,
} from "#test/support";

import type { OriginalFileReader } from "../../../../core/instance";
import { DecisionsError } from "../../../../integrations/ai";

test("the job reads with the AI source chosen at consent after the owner switches", async ({
  orm,
  seed,
}) => {
  await seed.aiSource("openrouter");
  const source = await seed.fileSource({ content: CSV, status: "mapped" });
  const sources: Parameters<OriginalFileReader["readOriginalFile"]>[0][] = [];
  const imports = importUseCases(orm, {
    originalFileReader: {
      readOriginalFile: (aiSource) => {
        sources.push(aiSource);
        return Promise.resolve(PEOPLE);
      },
    },
  });
  await imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id, "openrouter");
  await seed.aiSource("broccoli_ai");
  expect(imports.sentJobs).toHaveLength(1);
  const [job] = imports.sentJobs;
  assert(job && "aiSource" in job.payload);
  expect(job.name).toBe("imports.readOriginalFile");

  await imports.originalFileReads.readOriginalFile(SYSTEM, job.payload);

  expect(sources).toEqual(["openrouter"]);
  expect(await imports.reads.listSources(SETUP_HOLDER)).toMatchObject([
    { id: source.id, originalReadAiSource: "openrouter" },
  ]);
});

test.for(["csv", "xlsx"] as const)(
  "the job sends real %s values without the file name and replaces the masked records",
  async (extension, { orm, seed }) => {
    const content =
      extension === "csv"
        ? CSV
        : sampleXlsxFile({
            sheets: [
              {
                name: "Staff",
                rows: [
                  ["Name", "Email"],
                  ["Avery Stone", "avery@example.com"],
                ],
              },
            ],
          });
    const source = await seed.fileSource({
      name: `private-staff.${extension}`,
      content,
      status: "mapped",
    });
    await seed.importEmployees(source.id, [
      { firstName: "Robin", lastName: "Reed", email: "robin@example.com" },
    ]);
    const requests: Parameters<OriginalFileReader["readOriginalFile"]>[1][] = [];
    const imports = importUseCases(orm, {
      originalFileReader: {
        readOriginalFile: (_source, request) => {
          requests.push(request);
          return Promise.resolve(PEOPLE);
        },
      },
    });
    await imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id, "broccoli_ai");

    await imports.originalFileReads.readOriginalFile(SYSTEM, {
      sourceId: source.id,
      attempt: 1,
      aiSource: null,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.file).toMatchObject({
      mimeType: "text/csv",
      text: expect.stringContaining("Avery Stone") as unknown,
    });
    expect(JSON.stringify(requests)).toContain("avery@example.com");
    expect(JSON.stringify(requests)).not.toContain(source.name);
    expect(requests[0]!.schema).toMatchObject({
      type: "object",
      properties: { people: { type: "array" } },
    });
    expect(await imports.reads.listSources(SETUP_HOLDER)).toMatchObject([
      { id: source.id, status: "mapped", failure: null },
    ]);
    const records = await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: source.id });
    expect(
      records.edges.map(({ node }) => ({ firstName: node.firstName, email: node.email })),
    ).toEqual([{ firstName: "Avery", email: "avery@example.com" }]);
  },
);

test("the job sends a PDF as its stored bytes", async ({ orm }) => {
  const requests: Parameters<OriginalFileReader["readOriginalFile"]>[1][] = [];
  const imports = importUseCases(orm, {
    originalFileReader: {
      readOriginalFile: (_source, request) => {
        requests.push(request);
        return Promise.resolve(PEOPLE);
      },
    },
  });
  const id = await imports.files.uploadFile(SETUP_HOLDER, {
    name: "private-staff.pdf",
    bytes: PDF,
  });
  await imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, id, "broccoli_ai");

  await imports.originalFileReads.readOriginalFile(SYSTEM, {
    sourceId: id,
    attempt: 1,
    aiSource: null,
  });

  expect(requests).toHaveLength(1);
  expect(requests[0]!.file).toEqual({ mimeType: "application/pdf", bytes: PDF });
  expect(JSON.stringify(requests)).not.toContain("private-staff.pdf");
  expect(await imports.reads.listSources(SETUP_HOLDER)).toMatchObject([{ id, status: "mapped" }]);
});

test("a cut-off answer fails the file as an incomplete original read", async ({ orm, seed }) => {
  const source = await seed.fileSource({ content: CSV, status: "mapped" });
  const imports = importUseCases(orm, {
    originalFileReader: {
      readOriginalFile: () =>
        Promise.reject(new DecisionsError("Cut off", false, null, "answer_cut_off")),
    },
  });
  await imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id, "broccoli_ai");

  await imports.originalFileReads.readOriginalFile(SYSTEM, {
    sourceId: source.id,
    attempt: 1,
    aiSource: null,
  });

  expect(await imports.reads.listSources(SETUP_HOLDER)).toMatchObject([
    { id: source.id, status: "failed", failure: "original_read_incomplete" },
  ]);
});

test("an invalid model answer fails the file as unavailable", async ({ orm, seed }) => {
  const source = await seed.fileSource({ content: CSV, status: "mapped" });
  const imports = importUseCases(orm, {
    originalFileReader: { readOriginalFile: () => Promise.resolve({ people: [{ email: 42 }] }) },
  });
  await imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id, "broccoli_ai");

  await imports.originalFileReads.readOriginalFile(SYSTEM, {
    sourceId: source.id,
    attempt: 1,
    aiSource: null,
  });

  expect(await imports.reads.listSources(SETUP_HOLDER)).toMatchObject([
    { id: source.id, status: "failed", failure: "unavailable" },
  ]);
});

test("a job with no people left fails the file as having no people columns", async ({
  orm,
  seed,
}) => {
  const source = await seed.fileSource({ content: CSV, status: "mapped" });
  const imports = importUseCases(orm, {
    originalFileReader: {
      readOriginalFile: () => Promise.resolve({ people: [{ jobTitle: "Designer" }] }),
    },
  });
  await imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id, "broccoli_ai");

  await imports.originalFileReads.readOriginalFile(SYSTEM, {
    sourceId: source.id,
    attempt: 1,
    aiSource: null,
  });

  expect(await imports.reads.listSources(SETUP_HOLDER)).toMatchObject([
    { id: source.id, status: "failed", failure: "no_people_columns" },
  ]);
});

test("a job from an earlier attempt leaves the source and its records unchanged", async ({
  orm,
  seed,
}) => {
  const source = await seed.fileSource({ content: CSV, status: "mapped" });
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);
  await imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id, "broccoli_ai");
  const before = await imports.reads.listSources(SETUP_HOLDER);
  const records = await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: source.id });

  await imports.originalFileReads.readOriginalFile(SYSTEM, {
    sourceId: source.id,
    attempt: 0,
    aiSource: null,
  });

  expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual(before);
  expect(await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: source.id })).toEqual(
    records,
  );
});
