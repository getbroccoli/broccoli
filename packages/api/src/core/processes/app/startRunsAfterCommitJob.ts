import type { JobHandlers } from "../../jobs";
import type { Logger } from "../../logger";
import { PrincipalSecurityContext } from "../../security";
import type { ProcessService } from "./processService";

/** As the system: starts an after-commit process's runs for the event its job carries. */
export function startRunsAfterCommitJob({
  processes,
  logger,
}: {
  processes: ProcessService;
  logger: Logger;
}): JobHandlers {
  return {
    "processes.startRunsAfterCommit": {
      run: (job) => processes.startRunsAfterCommit(PrincipalSecurityContext.system(), job),
      onFailed: ({ processId, versionId, hop, event }) => {
        logger.error(
          { processId, versionId, hop, eventId: event.id, eventType: event.type },
          "Process runs not started after the change: every attempt failed",
        );
        return Promise.resolve();
      },
    },
  };
}
