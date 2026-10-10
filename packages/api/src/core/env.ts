import { z } from "zod";

export const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export const MODES = ["self_hosted", "managed"] as const;

/** Self-hosted installs create their owner on first visit; managed ones through the sign-in service. */
export type Mode = (typeof MODES)[number];

export interface Env {
  databaseUrl: string;
  port: number;
  logLevel: LogLevel;
  /** Folder of the built web app to serve; unset serves only the API. */
  webDir?: string;
  mode: Mode;
  /** Folder for files that must survive restarts, such as `secrets/`. */
  dataDir: string;
  /** Address browsers use to reach Broccoli; unset means it is taken from each request. */
  publicUrl?: string;
}

/** Compose passes unset variables as empty strings, so blank means unset. */
function blankAsUnset(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const envSchema = z
  .object({
    DATABASE_URL: z.preprocess(blankAsUnset, z.url({ protocol: /^postgres(ql)?$/ })),
    PORT: z.preprocess(blankAsUnset, z.coerce.number().int().min(1).max(65_535).default(3000)),
    LOG_LEVEL: z.preprocess(blankAsUnset, z.enum(LOG_LEVELS).default("info")),
    WEB_DIR: z.preprocess(blankAsUnset, z.string().optional()),
    BROCCOLI_MODE: z.preprocess(blankAsUnset, z.enum(MODES).default("self_hosted")),
    DATA_DIR: z.preprocess(blankAsUnset, z.string().default("/data")),
    PUBLIC_URL: z.preprocess(blankAsUnset, z.url({ protocol: /^https?$/ }).optional()),
  })
  .transform((variables): Env => ({
    databaseUrl: variables.DATABASE_URL,
    port: variables.PORT,
    logLevel: variables.LOG_LEVEL,
    webDir: variables.WEB_DIR,
    mode: variables.BROCCOLI_MODE,
    dataDir: variables.DATA_DIR,
    publicUrl: variables.PUBLIC_URL,
  }));

/** Reads and validates the environment; throws one error listing every problem. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
