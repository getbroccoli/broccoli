import { readFile } from "node:fs/promises";

import {
  expect,
  samplePdfFile,
  sampleStaffPdf,
  selectPdfRows,
  signInAsManagedOwner,
  startManagedEnv,
  test,
  type Browser,
} from "#test/support";

test.for([
  { code: "scanned_pdf", fixture: null },
  { code: "encrypted_pdf", fixture: "encrypted-refusal.pdf" },
])(
  "the upload route refuses a PDF with field code $code",
  async ({ code, fixture }, { fakeDecisions }) => {
    const { env, accounts } = await startManagedEnv({ decisionsUrl: fakeDecisions.url });
    const browser = await signInAsManagedOwner(env, accounts);
    const bytes =
      fixture === null
        ? samplePdfFile({ pages: [{ images: [{ x: 0, y: 0, width: 612, height: 792 }] }] })
        : await readFile(new URL(`../fixtures/pdf/${fixture}`, import.meta.url));

    const response = await browser.post("/api/imports/files?name=staff.pdf", Buffer.from(bytes));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "file", code }],
    });
  },
);

test("the upload route accepts readable text that the table reader cannot reconstruct", async ({
  fakeDecisions: fake,
}) => {
  fake.answerCompletion("rows", { content: { rows: [] } });
  fake.answerCompletion("hasEmployees", { content: { hasEmployees: false } });
  const { env, accounts } = await startManagedEnv({ decisionsUrl: fake.url });
  const browser = await signInAsManagedOwner(env, accounts);
  const bytes = await readFile(
    new URL("../fixtures/pdf/table-plus-prose-refusal.pdf", import.meta.url),
  );

  const response = await browser.post("/api/imports/files?name=staff.pdf", bytes);

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ sourceId: expect.any(String) as unknown });
});

test("maps an uploaded staff PDF into GraphQL employees using only masked private requests", async ({
  fakeDecisions: fake,
}) => {
  fake.answerCompletion("rows", selectPdfRows);
  const { env, accounts } = await startManagedEnv({ decisionsUrl: fake.url });
  const browser = await signInAsManagedOwner(env, accounts);

  const response = await browser.post(
    "/api/imports/files?name=staff.pdf",
    Buffer.from(sampleStaffPdf()),
  );

  expect(response.status).toBe(200);
  const { sourceId } = (await response.json()) as { sourceId: string };
  await expect
    .poll(() => readImport(browser), { timeout: 30_000 })
    .toEqual({
      data: {
        import: {
          sources: [{ id: sourceId, status: "MAPPED", failure: null }],
          employees: {
            edges: [
              {
                node: {
                  firstName: { value: "Avery" },
                  lastName: { value: "Stone" },
                  email: { value: "avery@example.com" },
                },
              },
              {
                node: {
                  firstName: { value: "Robin" },
                  lastName: { value: "Reed" },
                  email: { value: "robin@example.com" },
                },
              },
            ],
          },
        },
      },
    });
  expect(fake.completionRequests().length).toBeGreaterThan(0);
  for (const request of fake.completionRequests()) {
    expect(request.provider).toMatchObject({ zdr: true });
    const parts = request.messages.flatMap(({ content }) =>
      typeof content === "string" ? [] : content,
    );
    expect(parts.every(({ type }) => type === "text")).toBe(true);
  }
  const sent = JSON.stringify(fake.completionRequests());
  for (const literal of [
    "Avery",
    "Stone",
    "Robin",
    "Reed",
    "example.com",
    "Payroll Specialist",
    "03.02.2021",
  ]) {
    expect(sent).not.toContain(literal);
  }
}, 45_000);

async function readImport(browser: Browser): Promise<unknown> {
  return (
    await browser.graphql(`query {
    import {
      sources { id status failure }
      employees { edges { node { firstName { value } lastName { value } email { value } } } }
    }
  }`)
  ).json();
}
