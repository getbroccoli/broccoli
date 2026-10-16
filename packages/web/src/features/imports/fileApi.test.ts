import { afterEach, expect, it, vi } from "vitest";

import { uploadFile } from "./fileApi";

it.for([
  { code: "scanned_pdf", result: "scannedPdf" },
  { code: "encrypted_pdf", result: "encryptedPdf" },
])("reports $code with its upload result", async ({ code, result }) => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { code: "INVALID_INPUT", fieldErrors: [{ field: "file", code }] },
          { status: 400 },
        ),
      ),
  );

  expect(await uploadFile(new File(["%PDF-1.7"], "staff.pdf"))).toBe(result);
});

afterEach(() => vi.unstubAllGlobals());
