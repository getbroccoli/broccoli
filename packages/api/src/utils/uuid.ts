const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A uuid in the lowercase form Postgres returns, or null for a value that is none, so it never reaches a query. */
export function parseUuid(value: string): string | null {
  return UUID.test(value) ? value.toLowerCase() : null;
}
