import { z } from "zod";

import type { EmployeeListSearch } from "../employeeListSearch";

/**
 * The search params of a person's panel: which tab is open and which changes History shows. Each
 * falls back on its own, so a hand-edited URL still opens the panel.
 */
export const employeePanelSearch = z.object({
  tab: z.enum(["overview", "terms", "history"]).default("overview").catch("overview"),
  changes: z.enum(["all", "employmentTerms", "details"]).default("all").catch("all"),
});

export type EmployeePanelSearch = z.infer<typeof employeePanelSearch>;

/** The defaults, left out of the URL. */
export const DEFAULT_EMPLOYEE_PANEL_SEARCH = { tab: "overview", changes: "all" } as const;

/** The tab to show: Overview in place of Employment terms for a reader who may not read them. */
export function shownTab(
  tab: EmployeePanelSearch["tab"],
  { canReadTerms }: { canReadTerms: boolean },
): EmployeePanelSearch["tab"] {
  return tab === "terms" && !canReadTerms ? "overview" : tab;
}

/** The People list's own search, leaving the panel's tab and filter behind when the panel closes. */
export function listSearchOf({ q, sort, dir, after }: Partial<EmployeeListSearch>) {
  return { q, sort, dir, after };
}
