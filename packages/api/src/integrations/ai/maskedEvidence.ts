import { z } from "zod";

import { CompletionError } from "./referenceCompletions";

/** A word of the PDF as the model may see it: an id, a box, its shape and a generic category. */
export interface MaskedWord {
  id: string;
  box: [number, number, number, number];
  /** The word with letters as `X`/`x` and digits as `D`. */
  display: string;
  hint?: string;
  /** Words with the same text, ignoring case, share this number. */
  sameValue?: number;
  /** A candidate cell's row and column. */
  cell?: [number, number];
  /** The native words that spell a candidate cell. */
  sourceWords?: string[];
}

/** A page of native words, or one sheet of a candidate layout. */
export interface MaskedPage {
  page: number;
  width: number;
  height: number;
  words: MaskedWord[];
  candidateIndex?: number;
  sheetIndex?: number;
}

/** A page as visual lines of `[id, left, display, hint]`. */
export interface MaskedRowsPage {
  page: number;
  width: number;
  height: number;
  rows: { y: number; words: [string, number, string, string][] }[];
}

/** One person as word ids per field, with how the name and date are written. */
export interface DraftRecord {
  name: string[];
  firstName: string[];
  lastName: string[];
  email: string[];
  jobTitle: string[];
  startDate: string[];
  nameSource: "combined" | "separate";
  dateOrder: "dmy" | "mdy" | "ymd" | null;
}

/** What a completion may send: masked evidence and, for the email stage, drafts of its ids. */
export interface CompletionInput {
  evidence: { pages: (MaskedPage | MaskedRowsPage)[] };
  drafts?: { records: DraftRecord[] }[];
}

/**
 * The input as it may leave the instance: masked evidence only, every property known, every
 * display a shape, every hint a fixed category and every draft id a word of the evidence. Throws
 * `CompletionError` with code `privacy_violation` otherwise, before anything is sent.
 */
export function parseCompletionInput(input: unknown): CompletionInput {
  const parsed = completionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new CompletionError("privacy_violation", "The request holds more than masked evidence");
  }
  const ids = new Set(
    parsed.data.evidence.pages.flatMap((page) =>
      "words" in page
        ? page.words.map(({ id }) => id)
        : page.rows.flatMap(({ words }) => words.map(([id]) => id)),
    ),
  );
  const draftIds = (parsed.data.drafts ?? []).flatMap(({ records }) =>
    records.flatMap((record) => DRAFT_FIELDS.flatMap((field) => record[field])),
  );
  if (draftIds.some((id) => !ids.has(id))) {
    throw new CompletionError("privacy_violation", "A draft names a word outside the evidence");
  }
  return parsed.data;
}

const DRAFT_FIELDS = ["name", "firstName", "lastName", "email", "jobTitle", "startDate"] as const;

/** Every category a masked word's hint may name; nothing else describes a word. */
const CATEGORIES = [
  "text",
  "email",
  "number",
  "honorific",
  "qualification",
  "role_word",
  "label_word",
  ...["dmy", "mdy", "ymd", "unresolved"].flatMap((order) => [
    `date_${order}_year4`,
    `date_${order}_year2`,
  ]),
  "given_name_heading",
  "family_name_heading",
  "name_heading",
  "email_heading",
  "personal_email_heading",
  "role_heading",
  "hire_date_heading",
  "birth_date_heading",
  "phone_heading",
  "department_heading",
  "vacancy",
  "address_heading",
  "continuation_band_heading",
  "company_heading",
  "company_contact_heading",
  "document_title",
  "benefits_heading",
  "reporting_date_heading",
  "declaration_heading",
  "signature_heading",
  "office_only_heading",
  "pricing_heading",
  "bank_account_heading",
  "salary_heading",
  "excluded_contact_heading",
  "employee_section_heading",
  "blank_placeholder",
  "tabular_number",
];
const FIELDS = ["fullName", "firstName", "lastName", "email", "jobTitle", "startDate", "other"];

const hints = new Set([
  ...CATEGORIES,
  ...FIELDS.map((field) => `header:${field}`),
  ...FIELDS.flatMap((field) => CATEGORIES.map((category) => `field:${field};${category}`)),
]);

const id = z.string().regex(/^[wc]\d{5}$/u);
const nativeId = z.string().regex(/^w\d{5}$/u);
const coordinate = z.number().finite();
const index = z.number().int().nonnegative();
/** A shape: no letter, digit or mark but `X`, `x` and `D`. */
const display = z
  .string()
  .refine((value) => !/[\p{L}\p{N}\p{M}]/u.test(value.replace(/[XxD]/gu, "")));
const hint = z.string().refine((value) => hints.has(value));

const wordSchema = z.strictObject({
  id,
  box: z.tuple([coordinate, coordinate, coordinate, coordinate]),
  display,
  hint: hint.optional(),
  sameValue: z.number().int().positive().optional(),
  cell: z.tuple([index, index]).optional(),
  sourceWords: z.array(nativeId).optional(),
});
const pageGeometry = { page: z.number().int().positive(), width: coordinate, height: coordinate };
const wordsPageSchema = z.strictObject({
  ...pageGeometry,
  words: z.array(wordSchema),
  candidateIndex: index.optional(),
  sheetIndex: index.optional(),
});
const rowsPageSchema = z.strictObject({
  ...pageGeometry,
  rows: z.array(
    z.strictObject({
      y: coordinate,
      words: z.array(z.tuple([id, coordinate, display, z.union([z.literal(""), hint])])),
    }),
  ),
});
const draftSchema = z.strictObject({
  ...Object.fromEntries(DRAFT_FIELDS.map((field) => [field, z.array(id)])),
  nameSource: z.enum(["combined", "separate"]),
  dateOrder: z.enum(["dmy", "mdy", "ymd"]).nullable(),
}) as unknown as z.ZodType<DraftRecord>;
const completionInputSchema = z.strictObject({
  evidence: z.strictObject({ pages: z.array(z.union([wordsPageSchema, rowsPageSchema])) }),
  drafts: z.array(z.strictObject({ records: z.array(draftSchema) })).optional(),
});
