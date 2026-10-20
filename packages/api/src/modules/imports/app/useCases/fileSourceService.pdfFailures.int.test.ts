import {
  expect,
  importUseCases,
  OWNER,
  SYSTEM,
  pdfImportTest as test,
  selectPdfRows,
} from "#test/support";
import { createReferenceCompletions } from "../../../../integrations/ai";
import { PDF_COMPLETION_TASKS } from "../../pdfExtraction";

test("recovers once from a 503 using the recovery routing and token settings", async ({
  imports,
  sourceId,
  fakeDecisions: fake,
}) => {
  fake.answerCompletion("rows", { status: 503 }, selectPdfRows);

  await imports.files.mapFile(SYSTEM, { sourceId, attempt: 0 });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([{ status: "mapped" }]);
  expect(fake.completionRequests()).toMatchObject([
    {
      provider: { order: ["inference-net"], allow_fallbacks: false },
      reasoning: { effort: "low" },
    },
    {
      provider: {
        order: ["wafer", "inference-net"],
        allow_fallbacks: true,
        zdr: true,
        data_collection: "deny",
        require_parameters: true,
      },
      reasoning: { enabled: false },
      max_tokens: 12000,
    },
  ]);
});

test("leaves the file mapping with no records when both provider attempts fail", async ({
  imports,
  sourceId,
  fakeDecisions: fake,
}) => {
  fake.answerCompletion("rows", { status: 503 });

  await expect(imports.files.mapFile(SYSTEM, { sourceId, attempt: 0 })).rejects.toMatchObject({
    retryable: true,
  });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    { status: "mapping", failure: null },
  ]);
  expect(await imports.reads.employeeCount(OWNER)).toBe(0);
  expect(fake.completionRequests()).toHaveLength(2);
});

test.for([
  { failure: "a 401", reply: { status: 401 }, requests: 1 },
  { failure: "non-JSON output twice", reply: { content: "not json" }, requests: 2 },
  {
    failure: "an unknown selected row",
    reply: { content: { rows: [{ candidate: 0, sheet: 0, row: 9999 }] } },
    requests: 1,
  },
])(
  "fails the file as unavailable after $failure",
  async ({ reply, requests }, { imports, sourceId, fakeDecisions: fake }) => {
    fake.answerCompletion("rows", reply);

    await imports.files.mapFile(SYSTEM, { sourceId, attempt: 0 });

    expect(await imports.reads.listSources(OWNER)).toMatchObject([
      { status: "failed", failure: "unavailable" },
    ]);
    expect(await imports.reads.employeeCount(OWNER)).toBe(0);
    expect(fake.completionRequests()).toHaveLength(requests);
  },
);

test("fails an unsupported Broccoli AI source without sending a request", async ({
  orm,
  sourceId,
  fakeDecisions: fake,
}) => {
  const completions = createReferenceCompletions({
    readSource: () => Promise.resolve({ kind: "broccoli_ai", url: fake.url }),
    tasks: PDF_COMPLETION_TASKS,
  });
  const imports = importUseCases(orm, { completions });

  await imports.files.mapFile(SYSTEM, { sourceId, attempt: 0 });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    { status: "failed", failure: "unavailable" },
  ]);
  expect(await imports.reads.employeeCount(OWNER)).toBe(0);
  expect(fake.httpRequests()).toEqual([]);
});

test("does not restore a removed file when its held model answer arrives", async ({
  imports,
  sourceId,
  fakeDecisions: fake,
}) => {
  const held = fake.holdNextCompletion();
  const mapping = imports.files.mapFile(SYSTEM, { sourceId, attempt: 0 });
  try {
    await Promise.race([held.received, mapping]);
    expect(fake.completionRequests()).toHaveLength(1);
    await imports.files.removeFile(OWNER, sourceId);
    held.release();
    await mapping;

    expect(await imports.reads.listSources(OWNER)).toEqual([]);
    expect(await imports.reads.employeeCount(OWNER)).toBe(0);
  } finally {
    held.release();
    await mapping;
  }
});

test("aborts a held completion at the run deadline and stores no records", async ({
  orm,
  sourceId,
  fakeDecisions: fake,
}) => {
  const imports = importUseCases(orm, { completions: fake.completions, pdfRunDeadlineMs: 10_000 });
  const held = fake.holdNextCompletion();
  const mapping = imports.files.mapFile(SYSTEM, { sourceId, attempt: 0 });
  const rejected = expect(mapping).rejects.toMatchObject({ retryable: true });
  try {
    await Promise.race([held.received, mapping]);
    expect(fake.completionRequests()).toHaveLength(1);
    await rejected;

    expect(await imports.reads.listSources(OWNER)).toMatchObject([{ status: "mapping" }]);
    expect(await imports.reads.employeeCount(OWNER)).toBe(0);
    expect(fake.completionRequests()).toHaveLength(1);
  } finally {
    held.release();
    await rejected;
  }
});
