import { expect, it } from "vitest";

import { employeePanelSearch } from "./employeePanelSearch";

it("opens Overview with all changes for an empty search", () => {
  const search = employeePanelSearch.parse({});

  expect(search).toEqual({ tab: "overview", changes: "all" });
});

it("keeps History filtered to Employment terms", () => {
  const search = employeePanelSearch.parse({ tab: "history", changes: "employmentTerms" });

  expect(search).toEqual({ tab: "history", changes: "employmentTerms" });
});

it("falls back to Overview and all changes for unknown values", () => {
  const search = employeePanelSearch.parse({ tab: "unknown", changes: "unknown" });

  expect(search).toEqual({ tab: "overview", changes: "all" });
});
