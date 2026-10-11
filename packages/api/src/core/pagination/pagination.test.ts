import { expect, it } from "vitest";
import { z } from "zod";

import { parsePage, toConnection } from ".";

const keysetSchema = z.tuple([z.string(), z.uuid()]);

it("defaults to the first 100 rows", () => {
  const page = parsePage({}, keysetSchema);

  expect(page).toEqual({ first: 100, after: null });
});

it("refuses a page size of 0", () => {
  expect(() => parsePage({ first: 0 }, keysetSchema)).toThrowError(
    expect.objectContaining({
      name: "ApplicationError",
      code: "INVALID_INPUT",
      message: "The input is invalid.",
      fieldErrors: [{ field: "first", code: "out_of_range" }],
    }),
  );
});

it("refuses a page size greater than 10000", () => {
  expect(() => parsePage({ first: 10_001 }, keysetSchema)).toThrowError(
    expect.objectContaining({
      name: "ApplicationError",
      code: "INVALID_INPUT",
      message: "The input is invalid.",
      fieldErrors: [{ field: "first", code: "out_of_range" }],
    }),
  );
});

it("refuses a malformed cursor", () => {
  expect(() => parsePage({ after: "not-a-cursor" }, keysetSchema)).toThrowError(
    expect.objectContaining({
      name: "ApplicationError",
      code: "INVALID_INPUT",
      message: "The input is invalid.",
      fieldErrors: [{ field: "after", code: "invalid" }],
    }),
  );
});

it("refuses a cursor whose keyset does not match the list", () => {
  const connection = toConnection([{ node: "Ada", keyset: [1, 2] }], 1);
  const cursor = connection.edges[0]!.cursor;

  expect(() => parsePage({ after: cursor }, keysetSchema)).toThrowError(
    expect.objectContaining({
      name: "ApplicationError",
      code: "INVALID_INPUT",
      message: "The input is invalid.",
      fieldErrors: [{ field: "after", code: "invalid" }],
    }),
  );
});

it("reads back the keyset of a cursor it issued", () => {
  const keyset = ["Ada", "00000000-0000-4000-8000-000000000001"];
  const connection = toConnection([{ node: "Ada", keyset }], 1);
  const cursor = connection.edges[0]!.cursor;

  const page = parsePage({ after: cursor }, keysetSchema);

  expect(page.after).toEqual(keyset);
});

it("builds a page with a next page from first + 1 rows", () => {
  const rows = [
    { node: "Ada", keyset: ["Ada", "00000000-0000-4000-8000-000000000001"] },
    { node: "Ben", keyset: ["Ben", "00000000-0000-4000-8000-000000000002"] },
    { node: "Sam", keyset: ["Sam", "00000000-0000-4000-8000-000000000003"] },
  ];

  const connection = toConnection(rows, 2);

  expect(connection.edges.map((edge) => edge.node)).toEqual(["Ada", "Ben"]);
  expect(connection.pageInfo).toEqual({
    hasNextPage: true,
    endCursor: connection.edges[1]!.cursor,
  });
});

it("builds the last page without a next page", () => {
  const rows = [
    { node: "Ada", keyset: ["Ada", "00000000-0000-4000-8000-000000000001"] },
    { node: "Ben", keyset: ["Ben", "00000000-0000-4000-8000-000000000002"] },
  ];

  const connection = toConnection(rows, 2);

  expect(connection.edges.map((edge) => edge.node)).toEqual(["Ada", "Ben"]);
  expect(connection.pageInfo).toEqual({
    hasNextPage: false,
    endCursor: connection.edges[1]!.cursor,
  });
});

it("builds an empty page", () => {
  const connection = toConnection([], 2);

  expect(connection).toEqual({
    edges: [],
    pageInfo: { hasNextPage: false, endCursor: null },
  });
});
