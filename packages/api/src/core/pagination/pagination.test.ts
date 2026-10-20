import { expect, it } from "vitest";
import { z } from "zod";

import { paginate, type KeysetQuery } from ".";

it("asks for the first 100 rows plus one in the default order", () => {
  const list = nameList();

  paginate({}, list);

  expect(list.queries).toEqual([
    { order: { field: "NAME", direction: "DESC" }, after: null, limit: 101 },
  ]);
});

it("uses the client's order, ascending when it names no direction", () => {
  const list = nameList();

  paginate({ orderBy: { field: "EMAIL" } }, list);

  expect(list.queries).toEqual([
    { order: { field: "EMAIL", direction: "ASC" }, after: null, limit: 101 },
  ]);
});

it("uses the client's order and explicit direction", () => {
  const list = nameList();

  paginate({ orderBy: { field: "EMAIL", direction: "DESC" } }, list);

  expect(list.queries).toEqual([
    { order: { field: "EMAIL", direction: "DESC" }, after: null, limit: 101 },
  ]);
});

it.for([0, 10_001])("refuses a page size of %i", (first) => {
  const list = nameList();

  expect(() => paginate({ first }, list)).toThrowError(
    expect.objectContaining({
      name: "ApplicationError",
      code: "INVALID_INPUT",
      message: "The input is invalid.",
      fieldErrors: [{ field: "first", code: "out_of_range" }],
    }),
  );
});

it("returns first rows and a next page when the source returns one more", () => {
  const list = nameList();

  const connection = paginate({ first: 2 }, list);

  expect(connection.edges.map((edge) => edge.node)).toEqual(["Sam", "Ben"]);
  expect(connection.pageInfo).toEqual({
    hasNextPage: true,
    endCursor: connection.edges[1]!.cursor,
  });
});

it("returns the last page without a next page", () => {
  const list = nameList();

  const connection = paginate({ first: 3 }, list);

  expect(connection.edges.map((edge) => edge.node)).toEqual(["Sam", "Ben", "Ada"]);
  expect(connection.pageInfo).toEqual({
    hasNextPage: false,
    endCursor: connection.edges[2]!.cursor,
  });
});

it("returns an empty page", () => {
  const list = nameList([]);

  const connection = paginate({ first: 2 }, list);

  expect(connection).toEqual({
    edges: [],
    pageInfo: { hasNextPage: false, endCursor: null },
  });
});

it("passes the sort values of a cursor it issued back to the source", () => {
  const list = nameList();
  const connection = paginate({ first: 2 }, list);
  const cursor = connection.edges[1]!.cursor;

  paginate({ first: 2, after: cursor }, list);

  expect(list.queries[1]).toEqual({
    order: { field: "NAME", direction: "DESC" },
    after: ["Ben"],
    limit: 3,
  });
});

it("refuses a malformed cursor", () => {
  const list = nameList();

  expect(() => paginate({ after: "not-a-cursor" }, list)).toThrowError(
    expect.objectContaining({
      name: "ApplicationError",
      code: "INVALID_INPUT",
      message: "The input is invalid.",
      fieldErrors: [{ field: "after", code: "invalid" }],
    }),
  );
});

it.for([
  { field: "NAME", direction: "ASC" },
  { field: "EMAIL", direction: "DESC" },
] as const)("refuses a cursor issued under another order: %j", (orderBy) => {
  const list = nameList();
  const connection = paginate({ first: 1 }, list);
  const cursor = connection.edges[0]!.cursor;

  expect(() => paginate({ after: cursor, orderBy }, list)).toThrowError(
    expect.objectContaining({
      name: "ApplicationError",
      code: "INVALID_INPUT",
      message: "The input is invalid.",
      fieldErrors: [{ field: "after", code: "invalid" }],
    }),
  );
});

it("refuses a cursor whose sort values do not match the order's schema", () => {
  const list = nameList();
  const connection = paginate(
    {},
    {
      ...list,
      keysetValues: { NAME: z.tuple([z.number()]), EMAIL: z.tuple([z.number()]) },
      fetch: () => [{ node: "Ada", values: [1] satisfies [number] }],
    },
  );
  const cursor = connection.edges[0]!.cursor;

  expect(() => paginate({ after: cursor }, list)).toThrowError(
    expect.objectContaining({
      name: "ApplicationError",
      code: "INVALID_INPUT",
      message: "The input is invalid.",
      fieldErrors: [{ field: "after", code: "invalid" }],
    }),
  );
});

function nameList(names = ["Ada", "Ben", "Sam"]) {
  const queries: KeysetQuery<"NAME" | "EMAIL", [string]>[] = [];
  return {
    order: { field: "NAME", direction: "DESC" } as const,
    keysetValues: { NAME: z.tuple([z.string()]), EMAIL: z.tuple([z.string()]) },
    queries,
    fetch(query: KeysetQuery<"NAME" | "EMAIL", [string]>) {
      queries.push(query);
      const ordered = [...names].sort();
      if (query.order.direction === "DESC") ordered.reverse();
      const start = query.after ? ordered.indexOf(query.after[0]) + 1 : 0;
      return ordered.slice(start, start + query.limit).map((node) => ({
        node,
        values: [node] satisfies [string],
      }));
    },
  };
}
