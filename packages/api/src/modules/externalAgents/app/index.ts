import type { Orm, Transact } from "../../../core/db";
import type { ImportServices } from "../../imports";
import { createExternalAgentActivity } from "./externalAgentActivity";
import {
  type ExternalAgentFileService,
  createExternalAgentFileService,
} from "./externalAgentFileService";
import {
  type ExternalAgentSessionService,
  createExternalAgentSessionService,
} from "./externalAgentSessionService";

export { createExternalAgentActivity } from "./externalAgentActivity";
export { createExternalAgentSessionService } from "./externalAgentSessionService";
export type { ExternalAgentCode, ExternalAgentSession } from "./externalAgentSessionService";

/** The services of the owner's external agent and the setup holder; adapters call nothing else. */
export interface ExternalAgentServices {
  sessions: ExternalAgentSessionService;
  files: ExternalAgentFileService;
}

/** Builds both services around one activity, so a file drop wakes the agent's waits. */
export function createExternalAgentServices({
  orm,
  transact,
  imports,
  clock = () => new Date(),
}: {
  orm: Orm;
  transact: Transact;
  imports: Pick<ImportServices, "answeredMapping" | "originalFileReads">;
  clock?: () => Date;
}): ExternalAgentServices {
  const context = { orm, transact, imports, clock, activity: createExternalAgentActivity() };
  return {
    sessions: createExternalAgentSessionService(context),
    files: createExternalAgentFileService(context),
  };
}
