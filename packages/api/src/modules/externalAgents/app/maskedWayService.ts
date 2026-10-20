import { ApplicationError } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import { lockSetupOpenToAgent } from "../../../core/instance";
import type { SecurityContext } from "../../../core/security";
import type { AnsweredSourceSummary, MappingAnswersInput, MappingQuestions } from "../../imports";
import { agentRepository } from "../db";
import { type AgentContext, asLiveAgent } from "./agentContext";

/**
 * The masked way: the owner drops staff files on Gather, and the external agent maps them by
 * answering Broccoli's masked questions; it never gets a file or a file's name.
 */
export interface MaskedWayService {
  /** The setup holder's drop: stores the file waiting for the agent's answers; returns its id. */
  uploadForAgent(ctx: SecurityContext, file: { name: string; bytes: Uint8Array }): Promise<string>;
  /** The files waiting for the agent's answers. */
  listWaiting(ctx: SecurityContext): Promise<AnsweredSourceSummary[]>;
  /** A waiting file's masked questions. */
  readQuestions(ctx: SecurityContext, sourceId: string): Promise<MappingQuestions>;
  /** Maps a waiting file with the agent's answers. */
  answer(
    ctx: SecurityContext,
    sourceId: string,
    answers: MappingAnswersInput,
  ): Promise<Omit<AnsweredSourceSummary, "id">>;
}

export function createMaskedWayService(context: AgentContext): MaskedWayService {
  const { transact, clock, imports } = context;
  const asMaskedAgent = <T>(ctx: SecurityContext, work: (tx: Tx) => Promise<T>) =>
    asLiveAgent(context, ctx, "answers_masked_questions", work);
  return {
    uploadForAgent: async (ctx, { name, bytes }) => {
      const sheets = await imports.answeredMapping.readStaffUpload(ctx, bytes);
      return transact(async (tx) => {
        const now = await lockSetupOpenToAgent(tx, clock);
        if (!now) {
          throw new ApplicationError("CONFLICT", "Choose your agent first.");
        }
        if ((await agentRepository(tx).findConnection(now))?.way === "parses_original_files") {
          throw new ApplicationError("CONFLICT", "Your agent reads the files itself.");
        }
        return imports.answeredMapping.addAnsweredSource(ctx, tx, { name, bytes, sheets });
      });
    },

    listWaiting: (ctx) =>
      asMaskedAgent(ctx, (tx) => imports.answeredMapping.readWaitingSources(ctx, tx)),

    readQuestions: (ctx, sourceId) =>
      asMaskedAgent(ctx, (tx) => imports.answeredMapping.readMappingQuestions(ctx, tx, sourceId)),

    answer: (ctx, sourceId, answers) =>
      asMaskedAgent(ctx, (tx) => imports.answeredMapping.answerMapping(ctx, tx, sourceId, answers)),
  };
}
