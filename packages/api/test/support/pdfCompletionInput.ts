import assert from "node:assert/strict";

import type { CompletionInput, MaskedPage } from "../../src/integrations/ai";
import type { FakeCompletionRequest } from "./fakeDecisions";

/** Reads the masked evidence and optional drafts from a captured completion request. */
export function pdfCompletionInput(request: FakeCompletionRequest): CompletionInput {
  const messages = request.messages.filter(({ role }) => role === "user");
  const evidence = messageText(messages[0]!.content);
  const drafts = messages[1] && messageText(messages[1].content);
  return {
    evidence: JSON.parse(evidence.slice(evidence.indexOf("{"))) as CompletionInput["evidence"],
    ...(drafts
      ? { drafts: JSON.parse(drafts.slice(drafts.indexOf("["))) as CompletionInput["drafts"] }
      : {}),
  };
}

/** Selects every named row of the first proposed layout using only its masked indexes. */
export function selectPdfRows(request: FakeCompletionRequest) {
  const pages = pdfCompletionInput(request).evidence.pages.filter(
    (page): page is MaskedPage => "words" in page && page.candidateIndex !== undefined,
  );
  assert(pages.length > 0, "The PDF must supply a candidate");
  const rows = new Map<string, { candidate: number; sheet: number; row: number }>();
  for (const page of pages.filter((page) => page.candidateIndex === pages[0]!.candidateIndex)) {
    for (const word of page.words) {
      if (
        !word.cell ||
        word.cell[0] === 0 ||
        !/^field:(fullName|firstName|lastName);/.test(word.hint ?? "")
      )
        continue;
      const position = {
        candidate: page.candidateIndex!,
        sheet: page.sheetIndex!,
        row: word.cell[0],
      };
      rows.set(`${position.sheet}:${position.row}`, position);
    }
  }
  return { rows: [...rows.values()] };
}

function messageText(content: FakeCompletionRequest["messages"][number]["content"]): string {
  return typeof content === "string" ? content : content.map(({ text }) => text ?? "").join("\n");
}
