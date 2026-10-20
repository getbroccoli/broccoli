import { z } from "zod";

import type { CompletionTask, CompletionTaskId } from "../../../../integrations/ai";
import {
  EMAIL_ASSIGNMENT_PROMPT,
  EVIDENCE_HEADING,
  LAYOUT_QUALIFICATION_PROMPT,
  REFERENCE_DRAFTS_INSTRUCTION,
  REFERENCE_EXTRACTION_PROMPT,
  ROW_SELECTION_PROMPT,
} from "./prompts";

// Above the tasks, which read them when the module loads.
const REFERENCE_FIELDS = ["name", "firstName", "lastName", "email", "jobTitle", "startDate"];
const INDEX = { type: "integer", minimum: 0 };

/**
 * The four PDF stages as the completion client registers them at startup. The JSON schemas are the
 * research's, which the providers were measured with; each parser reads the same shape.
 */
export const PDF_COMPLETION_TASKS: Readonly<Record<CompletionTaskId, CompletionTask>> = {
  select_rows: {
    instructions: ROW_SELECTION_PROMPT,
    evidenceHeading: EVIDENCE_HEADING,
    schema: strictObject({
      rows: arrayOf(strictObject({ candidate: INDEX, sheet: INDEX, row: INDEX })),
    }),
    output: z.strictObject({
      rows: z.array(z.strictObject({ candidate: index(), sheet: index(), row: index() })),
    }),
    reasoning: "low",
    maxTokens: 16_000,
    timeoutMs: 75_000,
  },
  qualify_layout: {
    instructions: LAYOUT_QUALIFICATION_PROMPT,
    evidenceHeading: EVIDENCE_HEADING,
    schema: strictObject({ hasEmployees: { type: "boolean" } }),
    output: z.strictObject({ hasEmployees: z.boolean() }),
    reasoning: "none",
    maxTokens: 1500,
    timeoutMs: 15_000,
  },
  extract_references: {
    instructions: REFERENCE_EXTRACTION_PROMPT,
    evidenceHeading: EVIDENCE_HEADING,
    schema: strictObject({
      records: arrayOf(
        strictObject({
          ...Object.fromEntries(
            REFERENCE_FIELDS.map((field) => [field, arrayOf({ type: "string" })]),
          ),
          nameSource: { type: "string", enum: ["combined", "separate"] },
          dateOrder: { type: ["string", "null"], enum: ["dmy", "mdy", "ymd", null] },
        }),
      ),
    }),
    output: z.strictObject({
      records: z.array(
        z.strictObject({
          name: ids(),
          firstName: ids(),
          lastName: ids(),
          email: ids(),
          jobTitle: ids(),
          startDate: ids(),
          nameSource: z.enum(["combined", "separate"]),
          dateOrder: z.enum(["dmy", "mdy", "ymd"]).nullable(),
        }),
      ),
    }),
    reasoning: "low",
    maxTokens: 16_000,
    timeoutMs: 75_000,
  },
  assign_emails: {
    instructions: EMAIL_ASSIGNMENT_PROMPT,
    evidenceHeading: EVIDENCE_HEADING,
    draftsInstruction: REFERENCE_DRAFTS_INSTRUCTION,
    schema: strictObject({
      assignments: arrayOf(
        strictObject({ row: INDEX, emailIds: { ...arrayOf({ type: "string" }), minItems: 1 } }),
      ),
    }),
    output: z.strictObject({
      assignments: z.array(z.strictObject({ row: index(), emailIds: ids().min(1) })),
    }),
    reasoning: "low",
    maxTokens: 16_000,
    timeoutMs: 75_000,
  },
};

function strictObject(properties: Record<string, object>): object {
  return {
    type: "object",
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}

function arrayOf(items: object) {
  return { type: "array", items };
}

function index() {
  return z.number().int().nonnegative();
}

function ids() {
  return z.array(z.string());
}
