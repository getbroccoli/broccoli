import { readFile } from "node:fs/promises";

import { expect, samplePdfFile, signInAsManagedOwner, startManagedEnv, test } from "#test/support";

test.for([
  { code: "scanned_pdf", fixture: null },
  { code: "encrypted_pdf", fixture: "encrypted-refusal.pdf" },
  { code: "no_table", fixture: "table-plus-prose-refusal.pdf" },
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
