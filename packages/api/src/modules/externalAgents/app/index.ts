import type { Orm, Transact } from "../../../core/db";
import type { ImportUseCases } from "../../imports";
import { type AgentSessionService, createAgentSessionService } from "./agentSessionService";
import { createMaskedWayService, type MaskedWayService } from "./maskedWayService";
import { createParsedWayService, type ParsedWayService } from "./parsedWayService";

export type { AgentCode, AgentSession } from "./agentSessionService";

/** Everything the owner's external agent and the setup holder do with it; adapters call nothing else. */
export interface ExternalAgentUseCases {
  sessions: AgentSessionService;
  maskedWay: MaskedWayService;
  parsedWay: ParsedWayService;
}

export function createExternalAgentUseCases({
  orm,
  transact,
  imports,
  clock = () => new Date(),
}: {
  orm: Orm;
  transact: Transact;
  imports: Pick<ImportUseCases, "answeredMapping" | "parsedSources">;
  clock?: () => Date;
}): ExternalAgentUseCases {
  const context = { orm, transact, imports, clock };
  return {
    sessions: createAgentSessionService(context),
    maskedWay: createMaskedWayService(context),
    parsedWay: createParsedWayService(context),
  };
}
