import { customType } from "drizzle-orm/pg-core";

/** A jsonb column that stores a lone surrogate as U+FFFD, as a text column does; Postgres refuses one in JSON. */
export const jsonb = customType<{ data: unknown; driverData: string }>({
  dataType: () => "jsonb",
  // `JSON.stringify` escapes only lone surrogates as `\udXXX`; matching `\\` first skips an escaped backslash.
  toDriver: (value) =>
    JSON.stringify(value).replace(/\\\\|\\ud[89a-f][0-9a-f]{2}/g, (match) =>
      match === "\\\\" ? match : "\\ufffd",
    ),
});
