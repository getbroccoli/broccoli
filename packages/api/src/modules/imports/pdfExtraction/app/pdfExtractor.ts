import {
  CompletionError,
  type CompletionInput,
  type CompletionTaskId,
  DecisionsError,
  type DraftRecord,
  type ReferenceCompletions,
} from "../../../../integrations/ai";
import type { Logger } from "../../../../core/logger";
import type { SecurityContext } from "../../../../core/security";
import {
  parsePdf,
  type PdfPage,
  type PdfWordPage,
  PdfWordsUnavailableError,
  readPdfWords,
} from "../../../../utils";
import type { IncomingRecord, SheetRefusal } from "../../domain";
import {
  documentEvidence,
  type DocumentEvidence,
  EMAIL,
  type EmailAssignments,
  evidenceRows,
  hasScannedPage,
  incomingRecords,
  InvalidModelOutputError,
  localCandidates,
  nativeLayoutPages,
  PDF_EXTRACTION_VERSION,
  PrivacyViolationError,
  prunedCandidates,
  rankedCandidates,
  type ReferenceOutput,
  referencedRecords,
  type RowSelection,
  selectedRows,
  type SourceRecord,
  unusedEmailIds,
  verifyEvidence,
  visibleNativeWords,
  withAssignedEmails,
} from "../domain";

/** Reads people from a PDF: checks it locally, then asks the model about masked evidence only. */
export interface PdfExtractor {
  /** The upload's checks, all local: why the PDF is refused, or null when it may be stored. */
  inspect(ctx: SecurityContext, bytes: Uint8Array): Promise<SheetRefusal | null>;
  /**
   * The PDF's people, none when it has none. Rejects with `PdfExtractionError`; a `retryable` one
   * may succeed later unchanged. Stage logs go to `logger`, with no document content.
   */
  extract(ctx: SecurityContext, bytes: Uint8Array, logger: Logger): Promise<IncomingRecord[]>;
}

/** Why an extraction failed; safe to log, it holds no document content. */
export type PdfExtractionFailure =
  "unreadable" | "unavailable" | "too_large" | "invalid_output" | "privacy_violation" | "deadline";

export class PdfExtractionError extends Error {
  constructor(
    readonly code: PdfExtractionFailure,
    readonly retryable: boolean,
  ) {
    super(`The PDF extraction failed: ${code}`);
    this.name = "PdfExtractionError";
  }
}

export function createPdfExtractor({
  completions,
  runDeadlineMs = RUN_DEADLINE_MS,
}: {
  completions: ReferenceCompletions;
  /** How long one extraction may take in all, reading included. */
  runDeadlineMs?: number;
}): PdfExtractor {
  return {
    inspect: async (ctx, bytes) => {
      ctx.requireSetupAccess();
      const pages = await parsePdf(bytes);
      const refusal = pdfRefusal(pages);
      if (refusal !== null) return refusal;
      const candidates = localCandidates([pages as PdfPage[]]);
      return typeof candidates === "string" ? candidates : null;
    },

    extract: async (ctx, bytes, logger) => {
      ctx.requireSetupAccess();
      const signal = AbortSignal.timeout(runDeadlineMs);
      try {
        return await extractPeople(bytes, { completions, signal, logger });
      } catch (error) {
        const failure = extractionFailure(error, signal);
        if (failure instanceof PdfExtractionError) {
          logger.warn(
            { algorithmVersion: PDF_EXTRACTION_VERSION, code: failure.code },
            "PDF extraction failed",
          );
        }
        throw failure;
      }
    },
  };
}

const RUN_DEADLINE_MS = 300_000;

interface Run {
  completions: ReferenceCompletions;
  signal: AbortSignal;
  logger: Logger;
}

function pdfRefusal(pages: PdfPage[] | "encrypted" | null): SheetRefusal | null {
  if (pages === "encrypted") return "encrypted_pdf";
  if (pages === null) return "unsupported_file";
  if (hasScannedPage(pages)) return "scanned_pdf";
  return pages.every(({ items }) => items.length === 0) ? "empty" : null;
}

async function extractPeople(bytes: Uint8Array, run: Run): Promise<IncomingRecord[]> {
  const pages = await parsePdf(bytes, { signal: run.signal });
  if (pages === null || pages === "encrypted" || pdfRefusal(pages) !== null) {
    throw new PdfExtractionError("unreadable", false);
  }
  const words = await readPdfWords(bytes, { signal: run.signal });
  const visible = words && visibleNativeWords(pages, words);
  if (!visible) throw new PdfExtractionError("unreadable", false);
  return peopleOf(pages, visible, run);
}

/** The table path when a candidate has a name column, else the path for unsupported layouts. */
async function peopleOf(
  pages: PdfPage[],
  words: PdfWordPage[],
  run: Run,
): Promise<IncomingRecord[]> {
  const candidates = localCandidates([pages, nativeLayoutPages(pages, words)]);
  if (typeof candidates === "string") throw new PdfExtractionError("too_large", false);
  const evidence = documentEvidence(words, rankedCandidates(prunedCandidates(candidates)));
  return evidence.candidatePages.length > 0
    ? selectedPeople(evidence, run)
    : referencedPeople(evidence, run);
}

/** The candidate rows the model selects, with missing emails it can assign from unused ones. */
async function selectedPeople(evidence: DocumentEvidence, run: Run): Promise<IncomingRecord[]> {
  const { candidatePages, registry } = evidence;
  const selection = (await ask(
    "select_rows",
    { pages: candidatePages },
    evidence,
    run,
  )) as RowSelection;
  const rows = selectedRows(selection, candidatePages, registry);
  const sources = await withOptionalEmails(
    rows.map(({ source }) => source),
    rows.map(({ draft }) => draft),
    evidence,
    run,
  );
  return incomingRecords(
    rows.map(({ draft }, index) => ({ source: sources[index]!, draft })),
    registry,
  );
}

/**
 * The rows with the emails the model assigns from email words no row holds yet. An ordinary
 * failure keeps the rows as they are and logs a warning without content; a privacy violation or
 * the deadline still fails the run.
 */
async function withOptionalEmails(
  sources: SourceRecord[],
  drafts: DraftRecord[],
  evidence: DocumentEvidence,
  run: Run,
): Promise<SourceRecord[]> {
  const unused = unusedEmailIds(evidence.registry, sources);
  if (unused.size === 0 || sources.every(({ email }) => EMAIL.test(email ?? ""))) return sources;
  try {
    const pages = [...evidence.nativePages, ...evidence.candidatePages];
    const output = await ask("assign_emails", { pages }, evidence, run, [{ records: drafts }]);
    return withAssignedEmails(sources, output as EmailAssignments, evidence.registry, unused);
  } catch (error) {
    if (run.signal.aborted || isPrivacyViolation(error)) throw error;
    run.logger.warn(
      { algorithmVersion: PDF_EXTRACTION_VERSION, stage: "assign_emails" },
      "Optional email assignment failed",
    );
    return sources;
  }
}

/** For pages no candidate reads: whether they hold employees, then those people as word ids. */
async function referencedPeople(evidence: DocumentEvidence, run: Run): Promise<IncomingRecord[]> {
  const { nativePages, registry } = evidence;
  if (nativePages.every(({ words }) => words.length === 0)) return [];
  const qualification = await ask("qualify_layout", { pages: nativePages }, evidence, run);
  if (!(qualification as { hasEmployees: boolean }).hasEmployees) return [];
  const output = await ask(
    "extract_references",
    { pages: evidenceRows(nativePages) },
    evidence,
    run,
  );
  return incomingRecords(referencedRecords(output as ReferenceOutput, registry), registry);
}

/** One stage's request, once its words match the registry; logs its proof, never its content. */
async function ask(
  task: CompletionTaskId,
  { pages }: CompletionInput["evidence"],
  evidence: DocumentEvidence,
  run: Run,
  drafts?: CompletionInput["drafts"],
): Promise<unknown> {
  verifyEvidence(
    pages.filter((page) => "words" in page),
    evidence.registry,
  );
  const started = performance.now();
  const { output, cost, requestSha256 } = await run.completions.complete(
    task,
    { evidence: { pages }, ...(drafts && { drafts }) },
    run.signal,
  );
  run.logger.info(
    {
      algorithmVersion: PDF_EXTRACTION_VERSION,
      stage: task,
      latencyMs: Math.round(performance.now() - started),
      cost,
      requestSha256,
    },
    "PDF extraction stage",
  );
  return output;
}

function isPrivacyViolation(error: unknown): boolean {
  return (
    error instanceof PrivacyViolationError ||
    (error instanceof CompletionError && error.code === "privacy_violation")
  );
}

/** The failure as a `PdfExtractionError`; an unexpected error stays as it is. */
function extractionFailure(error: unknown, signal: AbortSignal): unknown {
  if (signal.aborted) return new PdfExtractionError("deadline", true);
  if (error instanceof PdfExtractionError) return error;
  if (isPrivacyViolation(error)) return new PdfExtractionError("privacy_violation", false);
  if (error instanceof InvalidModelOutputError)
    return new PdfExtractionError("invalid_output", false);
  if (error instanceof PdfWordsUnavailableError)
    return new PdfExtractionError("unavailable", false);
  if (error instanceof DecisionsError)
    return new PdfExtractionError("unavailable", error.retryable);
  if (error instanceof CompletionError) {
    if (error.code === "too_large" || error.code === "invalid_output") {
      return new PdfExtractionError(error.code, false);
    }
    return new PdfExtractionError("unavailable", error.code === "transport");
  }
  return error;
}
