import { expect, it } from "vitest";

import { importReviewSearch, toImportReviewVariables } from "./importReviewSearch";

it("parses an empty search to name order, ascending", () => {
  expect(importReviewSearch.parse({})).toEqual({ sort: "name", dir: "asc" });
});

it("falls back for an unknown sort while keeping the direction", () => {
  expect(importReviewSearch.parse({ sort: "unknown", dir: "desc" })).toEqual({
    sort: "name",
    dir: "desc",
  });
});

it("falls back for an unknown direction while keeping the sort", () => {
  expect(importReviewSearch.parse({ sort: "email", dir: "unknown" })).toEqual({
    sort: "email",
    dir: "asc",
  });
});

it("trims the search text", () => {
  expect(importReviewSearch.parse({ q: "  Avery  " })).toEqual({
    q: "Avery",
    sort: "name",
    dir: "asc",
  });
});

it("builds a page of 50 with email descending, the cursor and search filter", () => {
  const variables = toImportReviewVariables({
    q: "Avery",
    sort: "email",
    dir: "desc",
    after: "cursor",
  });

  expect(variables).toEqual({
    first: 50,
    orderBy: { field: "EMAIL", direction: "DESC" },
    after: "cursor",
    filter: { search: "Avery" },
  });
});

it("omits the cursor and filter when unset", () => {
  expect(toImportReviewVariables({ sort: "name", dir: "asc" })).toEqual({
    first: 50,
    orderBy: { field: "NAME", direction: "ASC" },
  });
});
