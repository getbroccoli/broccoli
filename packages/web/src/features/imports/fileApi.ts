/** How an upload of a staff file ended. */
export type UploadFileResult =
  | "ok"
  | "unsupportedFile"
  | "empty"
  | "tooManyRows"
  | "tooManyColumns"
  | "tooManySheets"
  | "tooLarge"
  | "failed";

const RESULT_BY_FIELD_CODE: Partial<Record<string, UploadFileResult>> = {
  unsupported_file: "unsupportedFile",
  empty: "empty",
  too_many_rows: "tooManyRows",
  too_many_columns: "tooManyColumns",
  too_many_sheets: "tooManySheets",
};

/** Adds `file` to the import; the API reads it and maps its columns in the background. */
export function uploadFile(file: File): Promise<UploadFileResult> {
  return upload("/api/imports/files", file);
}

/** Adds `file` to the import for the owner's agent, which maps it by answering masked questions. */
export function uploadFileForExternalAgent(file: File): Promise<UploadFileResult> {
  return upload("/api/setup/external-agent-files", file);
}

/** Uploads one staff file: to the import, or for the owner's agent. */
export type FileUploader = (file: File) => Promise<UploadFileResult>;

async function upload(path: string, file: File): Promise<UploadFileResult> {
  try {
    const response = await fetch(`${path}?${new URLSearchParams({ name: file.name })}`, {
      method: "POST",
      body: file,
    });
    if (response.ok) {
      return "ok";
    }
    if (response.status === 413) {
      return "tooLarge";
    }
    if (response.status === 400) {
      const { fieldErrors } = (await response.json()) as { fieldErrors?: { code: string }[] };
      return RESULT_BY_FIELD_CODE[fieldErrors?.[0]?.code ?? ""] ?? "failed";
    }
    return "failed";
  } catch {
    return "failed";
  }
}
