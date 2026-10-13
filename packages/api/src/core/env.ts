import { z } from "zod";

import { parseOrigin } from "../utils";

export const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export const MODES = ["self_hosted", "managed"] as const;

/** Self-hosted installs create their owner on first visit; managed ones through the sign-in service. */
export type Mode = (typeof MODES)[number];

/** How this installation runs; each mode carries only its own settings. */
export type Deployment = SelfHostedDeployment | ManagedDeployment;

export interface SelfHostedDeployment {
  mode: "self_hosted";
  /** The address browsers use; unset means it is taken from each request. */
  publicUrl?: string;
}

/** The public accounts service; dev and tests point `MANAGED_ACCOUNTS_URL` elsewhere. */
export const DEFAULT_ACCOUNTS_URL = "https://accounts.getbroccoli.com";

/** Boot settings of a managed instance: the trust anchor for its signed init. */
export interface ManagedDeployment {
  mode: "managed";
  /** The pool slot; init tokens are addressed to `instance:<instanceId>`. */
  instanceId: string;
  /** Issuer of init tokens and sign-in tickets; its keys are at `/.well-known/jwks.json`. */
  accountsOrigin: string;
}

export interface Env {
  databaseUrl: string;
  port: number;
  logLevel: LogLevel;
  /** Folder of the built web app to serve; unset serves only the API. */
  webDir?: string;
  deployment: Deployment;
  /** Folder for files that must survive restarts, such as `secrets/`. */
  dataDir: string;
  /** Service that finds the brand of an email domain; null makes no lookup. */
  brandLookupUrl: string | null;
  /** The Slack OAuth relay on the accounts service; null connects no Slack. */
  slackRelayUrl: string | null;
}

/** Compose passes unset variables as empty strings, so blank means unset. */
function blankAsUnset(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const MANAGED_VARIABLES = ["MANAGED_INSTANCE_ID", "MANAGED_ACCOUNTS_URL"] as const;

const envSchema = z
  .object({
    DATABASE_URL: z.preprocess(blankAsUnset, z.url({ protocol: /^postgres(ql)?$/ })),
    PORT: z.preprocess(blankAsUnset, z.coerce.number().int().min(1).max(65_535).default(3000)),
    LOG_LEVEL: z.preprocess(blankAsUnset, z.enum(LOG_LEVELS).default("info")),
    WEB_DIR: z.preprocess(blankAsUnset, z.string().optional()),
    BROCCOLI_MODE: z.preprocess(blankAsUnset, z.enum(MODES).default("self_hosted")),
    DATA_DIR: z.preprocess(blankAsUnset, z.string().default("/data")),
    SELF_HOSTED_PUBLIC_URL: z.preprocess(blankAsUnset, z.url({ protocol: /^https?$/ }).optional()),
    MANAGED_INSTANCE_ID: z.preprocess(blankAsUnset, z.string().optional()),
    MANAGED_ACCOUNTS_URL: z.preprocess(blankAsUnset, z.string().optional()),
    BRAND_LOOKUP_URL: z.preprocess(blankAsUnset, z.url({ protocol: /^https?$/ }).optional()),
    SLACK_RELAY_URL: z.preprocess(blankAsUnset, z.url({ protocol: /^https?$/ }).optional()),
  })
  // Each mode refuses the other's variables, so no setting has two sources.
  .superRefine((variables, context) => {
    const refuse = (name: string, message: string) =>
      context.addIssue({ code: "custom", path: [name], message });
    if (variables.BROCCOLI_MODE === "self_hosted") {
      for (const name of MANAGED_VARIABLES) {
        if (variables[name] !== undefined) {
          refuse(name, "Only for BROCCOLI_MODE=managed");
        }
      }
      return;
    }
    if (variables.SELF_HOSTED_PUBLIC_URL !== undefined) {
      refuse("SELF_HOSTED_PUBLIC_URL", "Only for BROCCOLI_MODE=self_hosted");
    }
    if (variables.MANAGED_INSTANCE_ID === undefined) {
      refuse("MANAGED_INSTANCE_ID", "Required when BROCCOLI_MODE=managed");
    }
    if (accountsOrigin(variables.MANAGED_ACCOUNTS_URL) === null) {
      refuse("MANAGED_ACCOUNTS_URL", "Must be an https origin without a path");
    }
  })
  .transform((variables): Env => ({
    databaseUrl: variables.DATABASE_URL,
    port: variables.PORT,
    logLevel: variables.LOG_LEVEL,
    webDir: variables.WEB_DIR,
    deployment:
      variables.BROCCOLI_MODE === "managed"
        ? {
            mode: "managed",
            instanceId: variables.MANAGED_INSTANCE_ID!,
            accountsOrigin: accountsOrigin(variables.MANAGED_ACCOUNTS_URL)!,
          }
        : { mode: "self_hosted", publicUrl: variables.SELF_HOSTED_PUBLIC_URL },
    dataDir: variables.DATA_DIR,
    brandLookupUrl: variables.BRAND_LOOKUP_URL ?? null,
    slackRelayUrl: variables.SLACK_RELAY_URL ?? null,
  }));

function accountsOrigin(url: string | undefined): string | null {
  return parseOrigin(url ?? DEFAULT_ACCOUNTS_URL);
}

/** Reads and validates the environment; throws one error listing every problem. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
