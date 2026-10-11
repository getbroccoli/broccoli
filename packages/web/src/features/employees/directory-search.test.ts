import { expect, it } from "vitest";

import { directorySearch, toEmployeesVariables } from "./directory-search";

it("parses an empty search to name order, ascending", () => {
  const search = directorySearch.parse({});

  expect(search).toEqual({ sort: "name", dir: "asc" });
});

it("keeps a valid search", () => {
  const input = {
    q: "a".repeat(100),
    sort: "email",
    dir: "desc",
    after: "cursor",
  };

  const search = directorySearch.parse(input);

  expect(search).toEqual(input);
});

it("falls back to name order for an unknown sort", () => {
  const search = directorySearch.parse({ sort: "unknown" });

  expect(search).toEqual({ sort: "name", dir: "asc" });
});

it("falls back to ascending for an unknown direction", () => {
  const search = directorySearch.parse({ dir: "unknown" });

  expect(search).toEqual({ sort: "name", dir: "asc" });
});

it("trims the search text", () => {
  const search = directorySearch.parse({ q: "  Avery  " });

  expect(search).toEqual({ q: "Avery", sort: "name", dir: "asc" });
});

it("drops a blank search text", () => {
  const search = directorySearch.parse({ q: "   " });

  expect(search).toEqual({ sort: "name", dir: "asc" });
});

it("drops a search text longer than 100 characters", () => {
  const search = directorySearch.parse({ q: "a".repeat(101) });

  expect(search).toEqual({ sort: "name", dir: "asc" });
});

it("drops an empty cursor", () => {
  const search = directorySearch.parse({ after: "" });

  expect(search).toEqual({ sort: "name", dir: "asc" });
});

it("maps name order to the first page of 50", () => {
  const variables = toEmployeesVariables({ sort: "name", dir: "asc" });

  expect(variables).toEqual({
    first: 50,
    orderBy: { field: "NAME", direction: "ASC" },
  });
});

it("maps email descending", () => {
  const variables = toEmployeesVariables({ sort: "email", dir: "desc" });

  expect(variables).toEqual({
    first: 50,
    orderBy: { field: "EMAIL", direction: "DESC" },
  });
});

it("maps start date", () => {
  const variables = toEmployeesVariables({ sort: "startDate", dir: "asc" });

  expect(variables).toEqual({
    first: 50,
    orderBy: { field: "START_DATE", direction: "ASC" },
  });
});

it("passes the search text as a filter and the cursor as after", () => {
  const variables = toEmployeesVariables({
    q: "Avery",
    sort: "name",
    dir: "asc",
    after: "cursor",
  });

  expect(variables).toEqual({
    first: 50,
    orderBy: { field: "NAME", direction: "ASC" },
    filter: { search: "Avery" },
    after: "cursor",
  });
});
