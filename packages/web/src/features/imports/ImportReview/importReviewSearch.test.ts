import { expect, it } from "vitest";

import { toImportReviewVariables } from "./importReviewSearch";

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
