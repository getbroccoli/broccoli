import { z } from "zod";

/**
 * The search params of a person's panel: which tab is open and which changes History shows. Each
 * falls back on its own, so a hand-edited URL still opens the panel.
 */
export const employeePanelSearch = z.object({
  tab: z.enum(["overview", "history"]).default("overview").catch("overview"),
  changes: z.enum(["all", "employmentTerms", "details"]).default("all").catch("all"),
});

export type EmployeePanelSearch = z.infer<typeof employeePanelSearch>;

/** The defaults, left out of the URL. */
export const DEFAULT_EMPLOYEE_PANEL_SEARCH = { tab: "overview", changes: "all" } as const;
