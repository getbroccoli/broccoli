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
  /** As `listUnansweredFiles`, but with none waiting, waits up to `seconds` for the owner's next drop. */
  waitForUnansweredFiles(
    ctx: SecurityContext,
    request: { seconds: number },
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
  const { transact, clock, imports, fileDrops } = context;
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
      fileDrops.notify();
      return id;
    },

    listUnansweredFiles,

    waitForUnansweredFiles: async (ctx, { seconds }) => {
      // Listening before the first look, so a drop in between still wakes the wait.
      const drop = fileDrops.next(seconds * 1000);
      const files = await listUnansweredFiles(ctx);
      if (files.length > 0) {
        return files;
      }
      await drop;
      return listUnansweredFiles(ctx);
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
