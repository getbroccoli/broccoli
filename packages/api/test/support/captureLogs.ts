import { createLogger } from "../../src/core/logger";

/** Captures real structured logs, excluding pino's process and timestamp fields from entries. */
export function captureLogs() {
  const entries: Record<string, unknown>[] = [];
  let output = "";
  const logger = createLogger("info", {
    write(line: string) {
      output += line;
      const entry = JSON.parse(line) as Record<string, unknown>;
      delete entry.time;
      delete entry.pid;
      delete entry.hostname;
      entries.push(entry);
    },
  });
  return {
    logger,
    entries,
    get output() {
      return output;
    },
  };
}
