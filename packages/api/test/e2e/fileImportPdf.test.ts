import { readFile } from "node:fs/promises";

import { expect, samplePdfFile, signInAsManagedOwner, startManagedEnv, test } from "#test/support";

test.for(["scanned_pdf", "encrypted_pdf"])(
  "the upload route refuses a PDF with field code %s",
  async (code, { fakeDecisions }) => {
    const { env, accounts } = await startManagedEnv({ decisionsUrl: fakeDecisions.url });
    const browser = await signInAsManagedOwner(env, accounts);
    const bytes =
      code === "scanned_pdf"
        ? samplePdfFile({ pages: [{ images: [{ x: 0, y: 0, width: 612, height: 792 }] }] })
        : await readFile(new URL("../fixtures/pdf/encrypted-refusal.pdf", import.meta.url));

    const response = await browser.post("/api/imports/files?name=staff.pdf", Buffer.from(bytes));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "file", code }],
    });
  },
);
