import type { JobHandlers } from "../../jobs";
import type { Logger } from "../../logger";
import { PrincipalSecurityContext } from "../../security";
import type { AgentActivityService } from "./agentActivityService";

/** Every night at 03:00 London time, as the system: deletes agent activity older than 30 days. */
export function deleteOldAgentActivityJob({
  activity,
  logger,
}: {
  activity: AgentActivityService;
  logger: Logger;
}): JobHandlers {
  return {
    "agentAccess.deleteOldActivity": {
      schedule: { cron: "0 3 * * *", timeZone: "Europe/London", payload: {} },
      run: () => activity.deleteOldActivity(PrincipalSecurityContext.system()),
      onFailed: () => {
        logger.error("Old agent activity not deleted: the nightly run failed every attempt");
        return Promise.resolve();
      },
    },
  };
}
