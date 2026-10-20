import type { Answers, Question } from "../../../integrations/ai";
import { type FieldError, invalidInput } from "../../../core/applicationError";
import { FILE_FIELDS, type FileField, NONE } from "./fileMapping";

/** One sheet's questions, as `sheetQuestions` asks them. */
export type SheetQuestions = { headerRow: Question } & Record<FileField, Question>;

/** The answers the external agent sends per sheet, by 1-based sheet number and question id. */
export interface MappingAnswersInput {
  sheets: { sheet: number; answers: Record<string, string> }[];
}

/**
 * Each sheet's answers as the model's would be, sure of every choice; refused with INVALID_INPUT
 * unless every sheet is answered once, every question with one of its options, no column twice.
 */
export function parseMappingAnswers(
  questions: readonly SheetQuestions[],
  input: MappingAnswersInput,
): Answers<SheetQuestions>[] {
  const errors: FieldError[] = [];
  const answers: (Answers<SheetQuestions> | undefined)[] = questions.map(() => undefined);
  input.sheets.forEach(({ sheet, answers: given }, index) => {
    const sheetQuestions = questions[sheet - 1];
    if (!Number.isInteger(sheet) || !sheetQuestions || answers[sheet - 1]) {
      errors.push({ field: `sheets[${index}].sheet`, code: "unknown_sheet" });
      return;
    }
    const parsed = parseSheetAnswers(sheetQuestions, given, `sheets[${index}].answers`);
    if (Array.isArray(parsed)) {
      errors.push(...parsed);
    } else {
      answers[sheet - 1] = parsed;
    }
  });
  if (errors.length === 0 && answers.includes(undefined)) {
    errors.push({ field: "sheets", code: "missing_sheet" });
  }
  if (errors.length > 0) {
    throw invalidInput(errors);
  }
  return answers as Answers<SheetQuestions>[];
}

function parseSheetAnswers(
  questions: SheetQuestions,
  given: Record<string, string>,
  field: string,
): Answers<SheetQuestions> | FieldError[] {
  const errors: FieldError[] = [];
  const columnsTaken = new Set<string>();
  for (const id of ["headerRow", ...FILE_FIELDS] as const) {
    const choice = given[id];
    if (choice === undefined) {
      errors.push({ field: `${field}.${id}`, code: "missing_answer" });
    } else if (!Object.hasOwn(questions[id].options, choice)) {
      errors.push({ field: `${field}.${id}`, code: "unknown_choice" });
    } else if (id !== "headerRow" && choice !== NONE && columnsTaken.has(choice)) {
      errors.push({ field: `${field}.${id}`, code: "same_column" });
    } else if (id !== "headerRow") {
      columnsTaken.add(choice);
    }
  }
  if (errors.length > 0) {
    return errors;
  }
  return Object.fromEntries(
    Object.entries(questions).map(([id]) => [id, { choice: given[id]!, confidence: 1 }]),
  ) as Answers<SheetQuestions>;
}
