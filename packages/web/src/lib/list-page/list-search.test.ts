import { expect, it } from "vitest";

import { listSearchChange } from "./list-search";

it("returns to the first page for new search text without adding history", () => {
  const change = listSearchChange({ type: "query", q: "Avery" });

  expect(change).toEqual({
    patch: { q: "Avery", after: undefined },
    replace: true,
  });
});

it("clears the search and returns to the first page without adding history", () => {
  const change = listSearchChange({ type: "query", q: undefined });

  expect(change).toEqual({
    patch: { q: undefined, after: undefined },
    replace: true,
  });
});

it("changes the sort and returns to the first page with a history entry", () => {
  const change = listSearchChange({
    type: "sort",
    sort: { key: "email", direction: "desc" },
  });

  expect(change).toEqual({
    patch: { sort: "email", dir: "desc", after: undefined },
    replace: false,
  });
});

it("continues from the next cursor with a history entry", () => {
  const change = listSearchChange({ type: "next", after: "cursor" });

  expect(change).toEqual({
    patch: { after: "cursor" },
    replace: false,
  });
});

it("returns to the first page with a history entry", () => {
  const change = listSearchChange({ type: "first" });

  expect(change).toEqual({
    patch: { after: undefined },
    replace: false,
  });
});

it("replaces an invalid cursor so Back does not return to it", () => {
  const change = listSearchChange({ type: "resetCursor" });

  expect(change).toEqual({
    patch: { after: undefined },
    replace: true,
  });
});
