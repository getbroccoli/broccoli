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
  /** A waiting file's masked questions. */
  readQuestions(ctx: SecurityContext, sourceId: string): Promise<MappingQuestions>;
  /** Maps a waiting file with the agent's answers. */
  answer(
    ctx: SecurityContext,
    sourceId: string,
    answers: MappingAnswersInput,
  ): Promise<AnsweredMapping>;
}

export function createExternalAgentFileService(
  context: ExternalAgentContext,
): ExternalAgentFileService {
  const { transact, clock, imports } = context;
  return {
    uploadForExternalAgent: async (ctx, { name, bytes }) => {
      const sheets = await imports.answeredMapping.readStaffUpload(ctx, bytes);
      return transact(async (tx) => {
        const now = await lockSetupOpenToExternalAgent(tx, clock);
        if (!now) {
          throw new ApplicationError("CONFLICT", "Choose your agent first.");
        }
        return imports.answeredMapping.addAnsweredSource(ctx, tx, { name, bytes, sheets });
      });
    },

    listUnansweredFiles: (ctx) =>
      asLiveExternalAgent(context, ctx, (tx) =>
        imports.answeredMapping.readUnansweredSources(ctx, tx),
      ),

    readQuestions: (ctx, sourceId) =>
      asLiveExternalAgent(context, ctx, (tx) =>
        imports.answeredMapping.readMappingQuestions(ctx, tx, sourceId),
      ),

    answer: (ctx, sourceId, answers) =>
      asLiveExternalAgent(context, ctx, (tx) =>
        imports.answeredMapping.answerMapping(ctx, tx, sourceId, answers),
      ),
  };
}
