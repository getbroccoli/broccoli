import { ApplicationError } from "../../../core/applicationError";
import { lockSetupOpenToExternalAgent } from "../../../core/instance";
import type { SecurityContext } from "../../../core/security";
import type { AnsweredMapping, MappingAnswersInput, MappingQuestions } from "../../imports";
import { type ExternalAgentContext, asLiveExternalAgent } from "./externalAgentContext";

/**
 * The owner drops staff files on Gather, and the external agent maps them by answering Broccoli's
 * masked questions; it never gets a file or a file's name.
 */
export interface ExternalAgentFileService {
  /** The setup holder's drop: stores the file waiting for the agent's answers; returns its id. */
  uploadForExternalAgent(
    ctx: SecurityContext,
    file: { name: string; bytes: Uint8Array },
  ): Promise<string>;
  /** The files waiting for the agent's answers. */
  listUnansweredFiles(ctx: SecurityContext): Promise<{ id: string }[]>;
  /**
   * Long polling: as `listUnansweredFiles`, but with none waiting, waits up to `seconds` for the
   * owner's next drop; `signal` ends the wait early with none.
   */
  pollUnansweredFiles(
    ctx: SecurityContext,
    request: { seconds: number; signal?: AbortSignal },
  ): Promise<{ id: string }[]>;
  /** A waiting file's masked questions. */
  readMappingQuestions(ctx: SecurityContext, sourceId: string): Promise<MappingQuestions>;
  /** Maps a waiting file with the agent's answers. */
  answerMappingQuestions(
    ctx: SecurityContext,
    sourceId: string,
    answers: MappingAnswersInput,
  ): Promise<AnsweredMapping>;
}

export function createExternalAgentFileService(
  context: ExternalAgentContext,
): ExternalAgentFileService {
  const { transact, clock, imports, activity } = context;
  const listUnansweredFiles = (ctx: SecurityContext) =>
    asLiveExternalAgent(context, ctx, (tx) =>
      imports.answeredMapping.readUnansweredSources(ctx, tx),
    );
  return {
    uploadForExternalAgent: async (ctx, { name, bytes }) => {
      const sheets = await imports.answeredMapping.readStaffUpload(ctx, bytes);
      const id = await transact(async (tx) => {
        const now = await lockSetupOpenToExternalAgent(tx, clock);
        if (!now) {
          throw new ApplicationError("CONFLICT", "Choose your agent first.");
        }
        return imports.answeredMapping.addAnsweredSource(ctx, tx, { name, bytes, sheets });
      });
      activity.notifyDrop();
      return id;
    },

    listUnansweredFiles,

    pollUnansweredFiles: async (ctx, { seconds, signal }) => {
      // Listening before the first look, so a drop in between still wakes the wait.
      const wait = activity.waitForDrop(seconds * 1000);
      signal?.addEventListener("abort", wait.stop);
      if (signal?.aborted) {
        wait.stop();
      }
      try {
        const files = await listUnansweredFiles(ctx);
        if (files.length > 0) {
          return files;
        }
        await wait.dropped;
        return signal?.aborted ? [] : await listUnansweredFiles(ctx);
      } finally {
        wait.stop();
        signal?.removeEventListener("abort", wait.stop);
      }
    },

    readMappingQuestions: (ctx, sourceId) =>
      asLiveExternalAgent(context, ctx, (tx) =>
        imports.answeredMapping.readMappingQuestions(ctx, tx, sourceId),
      ),

    answerMappingQuestions: (ctx, sourceId, answers) =>
      asLiveExternalAgent(context, ctx, (tx) =>
        imports.answeredMapping.answerMapping(ctx, tx, sourceId, answers),
      ),
  };
}
