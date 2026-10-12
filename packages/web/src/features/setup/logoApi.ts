/** How an attempt to upload the company logo ended, as the logo field reports it. */
export type UploadLogoResult = "ok" | "invalidImage" | "tooLarge" | "failed";

const UPLOAD_LOGO_RESULT_BY_STATUS: Partial<Record<number, UploadLogoResult>> = {
  200: "ok",
  400: "invalidImage",
  413: "tooLarge",
};

/** Replaces the company logo with `file`; the API checks its format and size. */
export async function uploadLogo(file: File): Promise<UploadLogoResult> {
  try {
    const response = await fetch("/api/company/logo", { method: "PUT", body: file });
    return UPLOAD_LOGO_RESULT_BY_STATUS[response.status] ?? "failed";
  } catch {
    return "failed";
  }
}
