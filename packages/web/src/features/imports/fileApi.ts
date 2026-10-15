/** How an upload of a staff file ended. */
export type UploadFileResult =
  | "ok"
  | "notCsv"
  | "empty"
  | "tooManyRows"
  | "tooManyColumns"
  | "tooLarge"
  | "failed";

const RESULT_BY_FIELD_CODE: Partial<Record<string, UploadFileResult>> = {
  not_csv: "notCsv",
  empty: "empty",
  too_many_rows: "tooManyRows",
  too_many_columns: "tooManyColumns",
};

/** Adds `file` to the import; the API reads it and maps its columns in the background. */
export async function uploadFile(file: File): Promise<UploadFileResult> {
  try {
    const response = await fetch(`/api/imports/files?${new URLSearchParams({ name: file.name })}`, {
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
