import { DrizzleQueryError } from "drizzle-orm";
import { DatabaseError } from "pg";
import { pino, type DestinationStream, type Logger } from "pino";

import type { LogLevel } from "./env";

export type { Logger };

/** Logs to stdout unless a destination is given. */
export function createLogger(level: LogLevel, destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      hooks: {
        // Before pino reads the error: it also copies the error's message into `msg`.
        logMethod(args, method) {
          const [first, ...rest] = args;
          if (first instanceof Error) {
            return method.apply(this, [withoutQueryValues(first), ...rest] as typeof args);
          }
          if (typeof first === "object" && first !== null && "err" in first) {
            const sanitised = { ...first, err: withoutQueryValues(first.err) };
            return method.apply(this, [sanitised, ...rest] as typeof args);
          }
          return method.apply(this, args);
        },
      },
    },
    destination,
  );
}

/** Logs identifiers, not contents: database errors lose the values they carry. */

function withoutQueryValues(error: unknown): unknown {
  if (error instanceof DrizzleQueryError) {
    // Drizzle puts the bound parameters into its message and stack as well.
    const message = `Failed query: ${error.query}`;
    return Object.assign(new Error(message), {
      name: error.name,
      stack: error.stack?.replace(error.message, message),
      cause: withoutQueryValues(error.cause),
    });
  }
  if (error instanceof DatabaseError) {
    // `detail` and `where` quote row values, such as the email of a duplicate key.
    const sanitised = Object.assign(new Error(error.message), error, {
      name: error.name,
      stack: error.stack,
    });
    delete sanitised.detail;
    delete sanitised.where;
    return sanitised;
  }
  return error;
}
