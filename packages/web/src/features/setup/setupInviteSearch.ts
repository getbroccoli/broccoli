import { z } from "zod";

import type { SetupInviteAudience } from "@/__generated__/graphql";

const AUDIENCES = [
  "ONLY_ADMINS",
  "ADMINS_AND_MANAGERS",
  "EVERYONE",
] as const satisfies readonly SetupInviteAudience[];

/** What the owner chose on "Who uses Broccoli", carried to setup's last page in its URL. */
export interface SetupInviteSearch {
  audience: SetupInviteAudience;
  /** The import employee the owner is; null for none. */
  me: string | null;
}

const schema = z.object({
  audience: z.enum(AUDIENCES).catch("ONLY_ADMINS"),
  me: z
    .string()
    .optional()
    .catch(undefined)
    .transform((me) => me || null),
});

/** The choices in a setup page's search params; anything unknown chooses nobody. */
export function parseSetupInviteSearch(search: Record<string, unknown>): SetupInviteSearch {
  return schema.parse(search);
}
