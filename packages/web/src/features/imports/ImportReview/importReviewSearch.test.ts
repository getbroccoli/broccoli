import { expect, it } from "vitest";

import { importReviewSearch, toImportReviewVariables } from "./importReviewSearch";

it("keeps a check and passes it alongside the search text in the filter", () => {
  const search = importReviewSearch.parse({ q: "  Avery  ", check: "conflict:jobTitle" });

  const variables = toImportReviewVariables(search);

  expect(search).toEqual({
    q: "Avery",
    check: "conflict:jobTitle",
    sort: "name",
    dir: "asc",
  });
  expect(variables).toEqual({
    first: 50,
    orderBy: { field: "NAME", direction: "ASC" },
    filter: { search: "Avery", check: "conflict:jobTitle" },
  });
});

it("drops a blank check while keeping the other parsed params", () => {
  const search = importReviewSearch.parse({
    q: "  Avery  ",
    check: "   ",
    sort: "email",
    dir: "desc",
    after: "cursor",
  });

  expect(search).toEqual({ q: "Avery", sort: "email", dir: "desc", after: "cursor" });
  expect(toImportReviewVariables(search)).toEqual({
    first: 50,
    orderBy: { field: "EMAIL", direction: "DESC" },
    after: "cursor",
    filter: { search: "Avery" },
  });
});

it("drops a check longer than 64 characters while keeping the other parsed params", () => {
  const search = importReviewSearch.parse({
    q: "  Avery  ",
    check: "a".repeat(65),
    sort: "startDate",
    dir: "desc",
    after: "cursor",
  });

  expect(search).toEqual({ q: "Avery", sort: "startDate", dir: "desc", after: "cursor" });
  expect(toImportReviewVariables(search)).toEqual({
    first: 50,
    orderBy: { field: "START_DATE", direction: "DESC" },
    after: "cursor",
    filter: { search: "Avery" },
  });
});

it("omits the filter without search text or a check", () => {
  const search = importReviewSearch.parse({});

  const variables = toImportReviewVariables(search);

  expect(variables).toEqual({
    first: 50,
    orderBy: { field: "NAME", direction: "ASC" },
  });
  expect(variables).not.toHaveProperty("filter");
});
