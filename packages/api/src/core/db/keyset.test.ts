import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { expect, it } from "vitest";

import { afterKeyset, keysetOrder, nullsLast } from ".";

it("continues after the id when there are no other sort columns", () => {
  const order = keysetOrder([], sql`id`, false);

  const query = new PgDialect().sqlToQuery(afterKeyset(order, [42]));

  expect(query.sql).toBe("id > $1");
  expect(query.params).toEqual([42]);
});

it("continues after a name, using the id to break equal-name ties", () => {
  const order = keysetOrder([{ expression: sql`name`, descending: false }], sql`id`, false);

  const query = new PgDialect().sqlToQuery(afterKeyset(order, ["Ada", 42]));

  expect(query.sql).toBe("(name > $1 or (name = $2 and id > $3))");
  expect(query.params).toEqual(["Ada", "Ada", 42]);
});

it("uses smaller values to continue through descending names and ids", () => {
  const order = keysetOrder([{ expression: sql`name`, descending: true }], sql`id`, true);

  const query = new PgDialect().sqlToQuery(afterKeyset(order, ["Ada", 42]));

  expect(query.sql).toBe("(name < $1 or (name = $2 and id < $3))");
  expect(query.params).toEqual(["Ada", "Ada", 42]);
});

it("requires every earlier column to tie before comparing a later column in its own direction", () => {
  const order = keysetOrder(
    [
      { expression: sql`department`, descending: false },
      { expression: sql`name`, descending: true },
    ],
    sql`id`,
    false,
  );

  const query = new PgDialect().sqlToQuery(afterKeyset(order, ["Engineering", "Ada", 42]));

  expect(query.sql).toBe(
    "(department > $1 or (department = $2 and name < $3) or (department = $4 and name = $5 and id > $6))",
  );
  expect(query.params).toEqual(["Engineering", "Engineering", "Ada", "Engineering", "Ada", 42]);
});

it("continues within missing names using the null flag and id instead of comparing SQL NULL", () => {
  const order = keysetOrder(nullsLast(sql`name`, true), sql`id`, true);

  const query = new PgDialect().sqlToQuery(afterKeyset(order, [true, "", 42]));

  expect(query.sql).toBe(
    "(name is null > $1 or (name is null = $2 and coalesce(name, '') < $3) or (name is null = $4 and coalesce(name, '') = $5 and id < $6))",
  );
  expect(query.params).toEqual([true, true, "", true, "", 42]);
});
