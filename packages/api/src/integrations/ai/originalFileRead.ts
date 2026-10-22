import { z } from "zod";

import { DecisionsError, NO_RETENTION, parseJson, postJson, readBody, refusal } from "./decisions";

/** Reads a whole file, personal data included, which only the owner's consent allows. */
export interface OriginalFileReader {
  /**
   * The model reads `file` in full and answers JSON fitting `schema`. Rejects with
   * `DecisionsError`; a cut-off answer has the reason `ANSWER_CUT_OFF`.
   */
  readOriginalFile(request: OriginalFileRead): Promise<unknown>;
}

export interface OriginalFileRead {
  /** What to read from the file; it never carries the file's data. */
  instructions: string;
  /** A PDF as itself; any other file as text. Never its name, which may name a person. */
  file: { mimeType: "application/pdf"; bytes: Uint8Array } | { mimeType: "text/csv"; text: string };
  /** The JSON Schema the answer must fit. */
  schema: Record<string, unknown>;
}

// shortcut: one model for every install; let the owner pick it once Broccoli offers a choice.
export const ORIGINAL_FILE_READ_MODEL = "deepseek/deepseek-v4.1-flash-1017";

/** The reason of a read whose answer the model cut off, such as a file too long for it. */
export const ANSWER_CUT_OFF = "answer_cut_off";

/** Reads from `endpoint`, OpenRouter's chat completions or one that speaks it, as `credential`. */
export function createOriginalFileReader({
  endpoint,
  credential,
  headers = {},
  timeoutMs = 300_000,
}: {
  endpoint: string;
  credential: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}): OriginalFileReader {
  return {
    readOriginalFile: async ({ instructions, file, schema }) => {
      const response = await postJson(
        endpoint,
        { ...headers, authorization: `Bearer ${credential}` },
        timeoutMs,
        {
          model: ORIGINAL_FILE_READ_MODEL,
          provider: NO_RETENTION,
          messages: [
            {
              role: "system",
              content: `${instructions}\nReturn JSON matching this schema: ${JSON.stringify(schema)}`,
            },
            { role: "user", content: [contentOf(file)] },
          ],
          // Schema-constrained decoding can omit populated optional fields; the caller validates.
          response_format: { type: "json_object" },
          ...(file.mimeType === "application/pdf" && { plugins: [PDF_TEXT] }),
        },
      );
      if (!response.ok) {
        throw await refusal(response);
      }
      return readAnswer(parseJson(await readBody(response)));
    },
  };
}

/** OpenRouter turns a PDF into text before the model reads it, free of charge. */
const PDF_TEXT = { id: "file-parser", pdf: { engine: "pdf-text" } };

const completionSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string() }), finish_reason: z.string() }))
    .min(1),
});

function contentOf(file: OriginalFileRead["file"]) {
  if (file.mimeType === "text/csv") {
    return { type: "text", text: file.text };
  }
  return {
    type: "file",
    file: {
      filename: "file.pdf",
      file_data: `data:application/pdf;base64,${Buffer.from(file.bytes).toString("base64")}`,
    },
  };
}

function readAnswer(body: unknown): unknown {
  const parsed = completionSchema.safeParse(body);
  if (!parsed.success) {
    throw new DecisionsError("The model's answer is unreadable", false);
  }
  const { message, finish_reason } = parsed.data.choices[0]!;
  if (finish_reason === "length") {
    throw new DecisionsError("The model's answer was cut off", false, null, ANSWER_CUT_OFF);
  }
  const answer = parseJson(message.content);
  if (answer === null) {
    throw new DecisionsError("The model's answer is not JSON", false);
  }
  return answer;
}
