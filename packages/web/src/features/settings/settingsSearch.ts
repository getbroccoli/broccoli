import { z } from "zod";

/** The Settings page's search params: which tab is open, Email by default. */
export const settingsSearch = z.object({
  tab: z.enum(["email", "locations"]).default("email").catch("email"),
});

/** The defaults, left out of the URL. */
export const DEFAULT_SETTINGS_SEARCH = { tab: "email" } as const;
