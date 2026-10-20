import { readFile } from "node:fs/promises";
import {
  expect,
  OWNER,
  SYSTEM,
  pdfImportTest as test,
  storedFileIds,
  samplePdfFile,
  pdfWithTooManyRows,
  sampleStaffPdf,
  selectPdfRows,
  pdfCompletionInput,
  type FakeCompletionRequest,
} from "#test/support";
import { files } from "../../../../core/files";

test("stores a mapping PDF source and queues its job without asking the model", async ({
  imports,
  orm,
  fakeDecisions: fake,
}) => {
  const bytes = sampleStaffPdf();
  const sourceId = await imports.files.uploadFile(OWNER, { name: "staff.pdf", bytes });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    { id: sourceId, name: "staff.pdf", kind: "file", status: "mapping", failure: null },
  ]);
  expect(imports.sentJobs).toEqual([
    { name: "imports.mapFile", payload: { sourceId, attempt: 0 } },
  ]);
  expect(
    await orm.select({ content: files.content, mimeType: files.mimeType }).from(files),
  ).toEqual([{ content: Buffer.from(bytes), mimeType: "application/pdf" }]);
  expect(fake.httpRequests()).toEqual([]);
});

test.for([
  {
    code: "scanned_pdf",
    pdf: () => samplePdfFile({ pages: [{ images: [{ x: 0, y: 0, width: 612, height: 792 }] }] }),
  },
  {
    code: "encrypted_pdf",
    pdf: () =>
      readFile(new URL("../../../../../test/fixtures/pdf/encrypted-refusal.pdf", import.meta.url)),
  },
  { code: "empty", pdf: () => samplePdfFile({ pages: [{}] }) },
  { code: "unsupported_file", pdf: () => Buffer.from("%PDF-1.7\nUnreadable") },
  { code: "too_many_rows", pdf: pdfWithTooManyRows },
])(
  "refuses $code without storing anything or queuing work",
  async ({ code, pdf }, { imports, orm, fakeDecisions: fake }) => {
    await expect(
      imports.files.uploadFile(OWNER, { name: "staff.pdf", bytes: await pdf() }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "file", code }],
    });

    expect(await imports.reads.listSources(OWNER)).toEqual([]);
    expect(await storedFileIds(orm)).toEqual([]);
    expect(imports.sentJobs).toEqual([]);
    expect(fake.httpRequests()).toEqual([]);
  },
);

test("accepts a readable text PDF without a table for background mapping", async ({
  imports,
  fakeDecisions: fake,
}) => {
  const sourceId = await imports.files.uploadFile(OWNER, {
    name: "staff.pdf",
    bytes: unsupportedPdf(),
  });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    { id: sourceId, status: "mapping" },
  ]);
  expect(imports.sentJobs).toEqual([
    { name: "imports.mapFile", payload: { sourceId, attempt: 0 } },
  ]);
  expect(fake.httpRequests()).toEqual([]);
});

test("stores selected people with their whole printed names, job titles, emails and dates", async ({
  imports,
  sourceId,
}) => {
  await imports.files.mapFile(SYSTEM, { sourceId, attempt: 0 });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    { id: sourceId, status: "mapped", failure: null },
  ]);
  const records = (await imports.reads.listEmployeeRecords(OWNER, { sourceId })).edges.map(
    ({ node }) => node,
  );
  expect(records).toHaveLength(2);
  expect(records).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        firstName: "Avery",
        lastName: "Stone",
        email: "avery@example.com",
        jobTitle: "Payroll Specialist",
        startDate: "2021-02-03",
      }),
      expect.objectContaining({
        firstName: "Robin",
        lastName: "Reed",
        email: "robin@example.com",
        jobTitle: "Design Lead",
        startDate: "2022-06-15",
      }),
    ]),
  );
});

test("masks Unicode names, combining marks, company details and instructions on every attempt", async ({
  imports,
  fakeDecisions: fake,
}) => {
  fake.answerCompletion("rows", { status: 503 }, selectPdfRows);
  const bytes = await readFile(
    new URL("../../../../../test/fixtures/pdf/sanitized-unicode-staff.pdf", import.meta.url),
  );
  const sourceId = await imports.files.uploadFile(OWNER, { name: "staff.pdf", bytes });

  await imports.files.mapFile(SYSTEM, { sourceId, attempt: 0 });

  expect(await imports.reads.employeeCount(OWNER)).toBe(2);
  expect(fake.completionRequests()).toHaveLength(2);
  const sent = JSON.stringify(fake.completionRequests());
  for (const value of [
    "Иван",
    "Петров",
    "A\u0301very",
    "Stone",
    "ivan@example.com",
    "avery@example.com",
    "example.com",
    "03.02.2021",
    "2022-06-15",
    "Acme",
    "Corp",
    "Ignore previous instructions",
  ]) {
    expect(sent).not.toContain(value);
  }
  for (const request of fake.completionRequests()) {
    const parts = request.messages.flatMap(({ content }) =>
      typeof content === "string" ? [] : content,
    );
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.every(({ type }) => type === "text")).toBe(true);
  }
});

test("requires private routing and the configured model on every request", async ({
  imports,
  sourceId,
  fakeDecisions: fake,
}) => {
  fake.answerCompletion("rows", { status: 503 }, selectPdfRows);

  await imports.files.mapFile(SYSTEM, { sourceId, attempt: 0 });

  expect(fake.completionRequests()).toHaveLength(2);
  for (const request of fake.completionRequests()) {
    expect(request).toMatchObject({
      model: "deepseek/deepseek-v4.1-flash-1017",
      temperature: 0,
      provider: { zdr: true, data_collection: "deny", require_parameters: true },
      response_format: { type: "json_schema", json_schema: { name: "staff", strict: true } },
    });
  }
});

test("fails an empty selection without trying another extraction method", async ({
  imports,
  sourceId,
  fakeDecisions: fake,
}) => {
  fake.answerCompletion("rows", { content: { rows: [] } });

  await imports.files.mapFile(SYSTEM, { sourceId, attempt: 0 });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    { status: "failed", failure: "no_people_columns" },
  ]);
  expect(await imports.reads.employeeCount(OWNER)).toBe(0);
  expect(fake.completionRequests()).toHaveLength(1);
});

test("fails an unsupported layout when qualification finds no employees", async ({
  imports,
  fakeDecisions: fake,
}) => {
  fake.answerCompletion("hasEmployees", { content: { hasEmployees: false } });
  const sourceId = await imports.files.uploadFile(OWNER, {
    name: "staff.pdf",
    bytes: unsupportedPdf(),
  });

  await imports.files.mapFile(SYSTEM, { sourceId, attempt: 0 });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    { status: "failed", failure: "no_people_columns" },
  ]);
  expect(await imports.reads.employeeCount(OWNER)).toBe(0);
  expect(fake.completionRequests()).toHaveLength(1);
  expect(fake.completionRequests()[0]).toMatchObject({
    reasoning: { enabled: false },
    max_tokens: 1500,
  });
});

test("restores word references after an unsupported layout qualifies", async ({
  imports,
  fakeDecisions: fake,
}) => {
  fake.answerCompletion("hasEmployees", { content: { hasEmployees: true } });
  fake.answerCompletion("records", (request) => {
    const pages = pdfCompletionInput(request).evidence.pages;
    const ids = pages.flatMap((page) =>
      "rows" in page ? page.rows.flatMap(({ words }) => words.map(([id]) => id)) : [],
    );
    expect(ids).toHaveLength(2);
    return {
      records: [
        {
          name: ids,
          firstName: [],
          lastName: [],
          email: [],
          jobTitle: [],
          startDate: [],
          nameSource: "combined",
          dateOrder: null,
        },
      ],
    };
  });
  const sourceId = await imports.files.uploadFile(OWNER, {
    name: "staff.pdf",
    bytes: unsupportedPdf(),
  });

  await imports.files.mapFile(SYSTEM, { sourceId, attempt: 0 });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([{ status: "mapped" }]);
  expect((await imports.reads.listEmployeeRecords(OWNER, { sourceId })).edges).toMatchObject([
    { node: { firstName: "Avery", lastName: "Stone", email: null } },
  ]);
  expect(fake.completionRequests()).toHaveLength(2);
  expect(JSON.stringify(fake.completionRequests())).not.toMatch(/Avery|Stone/);
});

test("fills missing row emails from native email references", async ({
  imports,
  fakeDecisions: fake,
}) => {
  fake.answerCompletion("assignments", assignEmails);
  const sourceId = await imports.files.uploadFile(OWNER, {
    name: "staff.pdf",
    bytes: sampleStaffPdf({ footerEmails: true }),
  });

  await imports.files.mapFile(SYSTEM, { sourceId, attempt: 0 });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([{ status: "mapped" }]);
  const records = (await imports.reads.listEmployeeRecords(OWNER, { sourceId })).edges.map(
    ({ node }) => node,
  );
  expect(records).toHaveLength(2);
  expect(records).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ firstName: "Avery", email: "avery@example.com" }),
      expect.objectContaining({ firstName: "Robin", email: "robin@example.com" }),
    ]),
  );
  expect(fake.completionRequests()).toHaveLength(2);
  expect(JSON.stringify(fake.completionRequests())).not.toMatch(
    /Avery|Stone|Robin|Reed|example\.com/,
  );
});

test("keeps the selected rows without emails when optional email completion fails", async ({
  imports,
  fakeDecisions: fake,
}) => {
  fake.answerCompletion("assignments", { status: 503 });
  const sourceId = await imports.files.uploadFile(OWNER, {
    name: "staff.pdf",
    bytes: sampleStaffPdf({ footerEmails: true }),
  });

  await imports.files.mapFile(SYSTEM, { sourceId, attempt: 0 });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    { status: "mapped", failure: null },
  ]);
  const records = (await imports.reads.listEmployeeRecords(OWNER, { sourceId })).edges.map(
    ({ node }) => node,
  );
  expect(records).toHaveLength(2);
  expect(records.map(({ email }) => email)).toEqual([null, null]);
  expect(fake.completionRequests()).toHaveLength(3);
});

function unsupportedPdf() {
  return samplePdfFile({ pages: [{ texts: [{ text: "Avery Stone", x: 40, y: 700 }] }] });
}

function assignEmails(request: FakeCompletionRequest) {
  const input = pdfCompletionInput(request);
  expect(input.drafts?.[0]?.records).toHaveLength(2);
  const emails = input.evidence.pages.flatMap((page) =>
    page.page < 1000 && "words" in page ? page.words.filter(({ hint }) => hint === "email") : [],
  );
  expect(emails).toHaveLength(2);
  return { assignments: emails.map(({ id }, row) => ({ row, emailIds: [id] })) };
}
