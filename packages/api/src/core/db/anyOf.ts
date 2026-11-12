import { sql, type Column, type SQL } from "drizzle-orm";

/**
 * `column` equals one of `values`, bound as one array parameter: `inArray` binds one per value,
 * and Postgres takes at most 65,535, fewer than a list the server builds itself can hold.
 */
export function anyOf(column: Column, values: Iterable<string>): SQL {
  return sql`${column} = any(${sql.param([...values])}::${sql.raw(column.getSQLType())}[])`;
}
