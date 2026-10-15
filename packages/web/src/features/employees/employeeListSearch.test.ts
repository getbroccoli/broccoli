import { expect, it } from "vitest";

import { employeeListSearch, toEmployeeListVariables } from "./employeeListSearch";

it("parses an empty search to name order, ascending", () => {
  const search = employeeListSearch.parse({});

  expect(search).toEqual({ sort: "name", dir: "asc" });
});

it("keeps a valid search", () => {
  const input = {
    q: "a".repeat(100),
    sort: "email",
    dir: "desc",
    after: "cursor",
  };

  const search = employeeListSearch.parse(input);

  expect(search).toEqual(input);
});

it("falls back to name order for an unknown sort", () => {
  const search = employeeListSearch.parse({ sort: "unknown" });

  expect(search).toEqual({ sort: "name", dir: "asc" });
});

it("falls back to ascending for an unknown direction", () => {
  const search = employeeListSearch.parse({ dir: "unknown" });

  expect(search).toEqual({ sort: "name", dir: "asc" });
});

it("trims the search text", () => {
  const search = employeeListSearch.parse({ q: "  Avery  " });

  expect(search).toEqual({ q: "Avery", sort: "name", dir: "asc" });
});

it("drops a blank search text", () => {
  const search = employeeListSearch.parse({ q: "   " });

  expect(search).toEqual({ sort: "name", dir: "asc" });
});

it("drops a search text longer than 100 characters", () => {
  const search = employeeListSearch.parse({ q: "a".repeat(101) });

  expect(search).toEqual({ sort: "name", dir: "asc" });
});

it("drops an empty cursor", () => {
  const search = employeeListSearch.parse({ after: "" });

  expect(search).toEqual({ sort: "name", dir: "asc" });
});

it("maps name order to the first page of 50", () => {
  const variables = toEmployeeListVariables({ sort: "name", dir: "asc" });

  expect(variables).toEqual({
    first: 50,
    orderBy: { field: "NAME", direction: "ASC" },
  });
});

it("maps email descending", () => {
  const variables = toEmployeeListVariables({ sort: "email", dir: "desc" });

  expect(variables).toEqual({
    first: 50,
    orderBy: { field: "EMAIL", direction: "DESC" },
  });
});

it("maps start date", () => {
  const variables = toEmployeeListVariables({ sort: "startDate", dir: "asc" });

  expect(variables).toEqual({
    first: 50,
    orderBy: { field: "START_DATE", direction: "ASC" },
  });
});

it("passes the search text as a filter and the cursor as after", () => {
  const variables = toEmployeeListVariables({
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
