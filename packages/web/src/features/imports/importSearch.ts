import { z } from "zod";

/** Why connecting Slack failed; set by the API's callback. */
export const SLACK_ERRORS = ["cancelled", "state", "failed"] as const;

/** The search params of the import step. */
export const importSearch = z.object({
  slackError: z.enum(SLACK_ERRORS).optional().catch(undefined),
});
