import type { Orm, Transact } from "../../../core/db";
import { PrincipalSecurityContext } from "../../../core/security";
import type { ImportUseCases } from "../../imports";
import {
  type ExternalAgentCode,
  type ExternalAgentSessionService,
  createExternalAgentSessionService,
} from "./externalAgentSessionService";
import {
  type ExternalAgentFileService,
  createExternalAgentFileService,
} from "./externalAgentFileService";
import { createExternalAgentActivity } from "./externalAgentActivity";

export type { ExternalAgentCode, ExternalAgentSession } from "./externalAgentSessionService";

/** Everything the owner's external agent and the setup holder do with it; adapters call nothing else. */
export interface ExternalAgentUseCases {
  sessions: ExternalAgentSessionService;
  files: ExternalAgentFileService;
}

export function createExternalAgentUseCases({
  orm,
  transact,
  imports,
  clock = () => new Date(),
}: {
  orm: Orm;
  transact: Transact;
  imports: Pick<ImportUseCases, "answeredMapping">;
  clock?: () => Date;
}): ExternalAgentUseCases {
  const context = { orm, transact, imports, clock, activity: createExternalAgentActivity() };
  return {
    sessions: createExternalAgentSessionService(context),
    files: createExternalAgentFileService(context),
  };
}

/**
 * A one-time code for the command run inside the server's container, as the system: whoever can run
 * it already controls the server. Refused with CONFLICT, like the setup holder, until the agent is chosen.
 */
export function createExternalAgentCodeOnServer({
  orm,
  transact,
}: {
  orm: Orm;
  transact: Transact;
}): Promise<ExternalAgentCode> {
  const sessions = createExternalAgentSessionService({
    orm,
    transact,
    clock: () => new Date(),
    activity: createExternalAgentActivity(),
  });
  return sessions.createExternalAgentCode(PrincipalSecurityContext.system());
}
