import fc from "fast-check";
import { sql } from "drizzle-orm";
import type { Orm } from "../../src/core/db";

/** Separate families keep a known NUL failure from hiding Unicode or length failures. */
export function hostileText(family: "nul" | "unicode" | "limits", limit: number) {
  if (family === "nul")
    return fc.tuple(fc.string(), fc.string()).map(([before, after]) => `${before}\0${after}`);
  if (family === "unicode")
    return fc
      .tuple(fc.string(), fc.constantFrom("\ud800", "\udfff", "\ufffe"), fc.string())
      .map(([before, character, after]) => `${before}${character}${after}`);
  return fc.oneof(
    fc.constantFrom("", " ", "\t\r\n", "\u00a0\u2003", "  Valid text  "),
    fc.constantFrom(limit - 1, limit, limit + 1, 10_000).map((length) => "x".repeat(length)),
  );
}

/** All application rows, including audit and indirect writes, in stable order; no production logic. */
export async function storedTextSnapshot(orm: Orm) {
  const tables = await orm.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
  );
  const reads = tables.rows.map(
    ({ tablename }) => sql`
    select ${tablename}::text as name,
      coalesce(jsonb_agg(to_jsonb(stored) order by to_jsonb(stored)::text), '[]'::jsonb) as rows
    from ${sql.identifier("public")}.${sql.identifier(tablename)} as stored
  `,
  );
  return (await orm.execute(sql.join(reads, sql` union all `))).rows;
}
