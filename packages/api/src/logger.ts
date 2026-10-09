import { pino, type Logger } from "pino";

import type { LogLevel } from "./env";

export type { Logger };

export function createLogger(level: LogLevel): Logger {
  return pino({ level });
}
