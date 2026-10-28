import { ApplicationError } from "../../../core/applicationError";
import { lockSetupOpenToExternalAgent } from "../../../core/instance";
import type { StoredFile } from "../../../core/files";
import type { SecurityContext } from "../../../core/security";
import {
  type AnsweredMapping,
  type ExternalAgentParseFileWay,
  type ExternalAgentFileProgress,
  type MappingAnswersInput,
  type MappingQuestions,
  parseReadPeople,
  type ReadPeopleOutcome,
} from "../../imports";
import { type ExternalAgentContext, asLiveExternalAgent } from "./externalAgentContext";

/**
 * The owner drops staff files on Gather, and the external agent maps them by answering Broccoli's
 * masked questions; it gets a file only once the owner allowed it to read that one in full, and
 * never a file's name.
 */
export interface ExternalAgentFileService {
  /** The setup holder's drop: stores the file waiting for the agent's answers; returns its id. */
  uploadForExternalAgent(
    ctx: SecurityContext,
    file: { name: string; bytes: Uint8Array },
  ): Promise<string>;
  /** The files waiting for the agent, and how it maps each. */
  listUnmappedFiles(ctx: SecurityContext): Promise<UnmappedFile[]>;
  /**
   * Long polling: as `listUnmappedFiles`, but with none waiting, waits up to `seconds` for the
   * owner's next drop; `signal` ends the wait early with none.
   */
  pollUnmappedFiles(
    ctx: SecurityContext,
    request: { seconds: number; signal?: AbortSignal },
  ): Promise<UnmappedFile[]>;
  /** Updates the file card with the stage reported by the live agent. */
  reportFileProgress(
    ctx: SecurityContext,
    sourceId: string,
    progress: ExternalAgentFileProgress,
  ): Promise<void>;
  /** A waiting file's masked questions. */
  readMappingQuestions(ctx: SecurityContext, sourceId: string): Promise<MappingQuestions>;
  /** Maps a waiting file with the agent's answers. */
  answerMappingQuestions(
    ctx: SecurityContext,
    sourceId: string,
    answers: MappingAnswersInput,
  ): Promise<AnsweredMapping>;
  /** The original of a file the owner let the agent read in full. */
  readOriginalFile(ctx: SecurityContext, sourceId: string): Promise<StoredFile>;
  /** The agent's people for a file it read in full replace the file's records, each time it sends. */
  sendReadPeople(ctx: SecurityContext, sourceId: string, body: unknown): Promise<ReadPeopleOutcome>;
  /** Wakes the agent's waits: a file now waits for it, such as one the owner let it read in full. */
  notifyFileWaiting(ctx: SecurityContext): void;
}

/** A file waiting for the external agent, by id only. */
export interface UnmappedFile {
  id: string;
  way: ExternalAgentParseFileWay;
}

export function createExternalAgentFileService(
  context: ExternalAgentContext,
): ExternalAgentFileService {
  const { transact, clock, imports, activity } = context;
  const listUnmappedFiles = (ctx: SecurityContext) =>
    asLiveExternalAgent(context, ctx, (tx) => imports.answeredMapping.readUnmappedSources(ctx, tx));
  return {
    uploadForExternalAgent: async (ctx, { name, bytes }) => {
      const upload = await imports.answeredMapping.readStaffUpload(ctx, { name, bytes });
      const id = await transact(async (tx) => {
        const now = await lockSetupOpenToExternalAgent(tx, clock);
        if (!now) {
          throw new ApplicationError("CONFLICT", "Choose your agent first.");
        }
        return imports.answeredMapping.addAnsweredSource(ctx, tx, { name, bytes, upload });
      });
      // A PDF waits for the owner's consent, not for the agent.
      if (upload.sheets) {
        activity.notifyDrop();
      }
      return id;
    },

    listUnmappedFiles,

    pollUnmappedFiles: async (ctx, { seconds, signal }) => {
      // Listening before the first look, so a drop in between still wakes the wait.
      const wait = activity.waitForDrop(seconds * 1000);
      signal?.addEventListener("abort", wait.stop);
      if (signal?.aborted) {
        wait.stop();
      }
      try {
        const files = await listUnmappedFiles(ctx);
        if (files.length > 0) {
          return files;
        }
        await wait.dropped;
        return signal?.aborted ? [] : await listUnmappedFiles(ctx);
      } finally {
        wait.stop();
        signal?.removeEventListener("abort", wait.stop);
      }
    },

    reportFileProgress: (ctx, sourceId, progress) =>
      asLiveExternalAgent(context, ctx, (tx) =>
        imports.answeredMapping.reportFileProgress(ctx, tx, sourceId, progress),
      ),

    readMappingQuestions: (ctx, sourceId) =>
      asLiveExternalAgent(context, ctx, (tx) =>
        imports.answeredMapping.readMappingQuestions(ctx, tx, sourceId),
      ),

    answerMappingQuestions: (ctx, sourceId, answers) =>
      asLiveExternalAgent(context, ctx, (tx) =>
        imports.answeredMapping.answerMapping(ctx, tx, sourceId, answers),
      ),

    readOriginalFile: (ctx, sourceId) =>
      asLiveExternalAgent(context, ctx, (tx) =>
        imports.originalFileReads.readOriginalBytes(ctx, tx, sourceId),
      ),

    sendReadPeople: async (ctx, sourceId, body) => {
      // Before the transaction: a list of thousands holds no lock while it is read.
      const people = parseReadPeople(body);
      return asLiveExternalAgent(context, ctx, (tx) =>
        imports.originalFileReads.addReadPeople(ctx, tx, sourceId, people),
      );
    },

    notifyFileWaiting: (ctx) => {
      ctx.require("MANAGE_WORKSPACE");
      activity.notifyDrop();
    },
  };
}
