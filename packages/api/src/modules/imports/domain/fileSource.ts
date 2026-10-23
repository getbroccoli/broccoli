import { ImportSource, type ImportSourceState, type MappingOutcome } from "./importSource";

/** A stored file source and the current mapping run. */
export interface FileSourceState extends ImportSourceState {
  kind: "file";
  fileId: string;
  mappingAttempt: number;
}

/** A file source owns its mapping transitions; repositories still guard against concurrent writes. */
export class FileSource extends ImportSource {
  readonly #fileId: string;
  readonly #mappingAttempt: number;

  constructor(state: FileSourceState) {
    super(state);
    this.#fileId = state.fileId;
    this.#mappingAttempt = state.mappingAttempt;
  }

  get fileId(): string {
    return this.#fileId;
  }

  get mappingAttempt(): number {
    return this.#mappingAttempt;
  }

  isCurrentMapping(attempt: number): boolean {
    return this.isReading() && this.mappingAttempt === attempt;
  }

  isCurrentOriginalRead(attempt: number): boolean {
    return this.isCurrentMapping(attempt) && this.originalReadAllowedAt !== null;
  }

  /** A stale or already finished attempt changes nothing; success clears the previous failure. */
  finishMapping(attempt: number, outcome: MappingOutcome): FileSource | null {
    if (!this.isCurrentMapping(attempt)) {
      return null;
    }
    return this.changed({
      status: outcome.status,
      failure: outcome.status === "failed" ? outcome.failure : null,
      failureMessage: outcome.status === "failed" ? (outcome.failureMessage ?? null) : null,
    });
  }

  /** Retry a failed model mapping or replace pending agent answers, unless the file has original-read consent. */
  restartMapping(): FileSource | null {
    if (
      this.originalReadAllowedAt !== null ||
      !(
        (this.readBy === "parsed_by_broccoli" && this.status === "failed") ||
        (this.readBy === "answered_by_external_agent" && this.isReading())
      )
    ) {
      return null;
    }
    return this.changed({
      status: "mapping",
      failure: null,
      failureMessage: null,
      readBy: "parsed_by_broccoli",
      mappingAttempt: this.mappingAttempt + 1,
    });
  }

  private changed(change: Partial<FileSourceState>): FileSource {
    return new FileSource({
      ...this.snapshot(),
      kind: "file",
      fileId: this.fileId,
      mappingAttempt: this.mappingAttempt,
      ...change,
    });
  }
}
