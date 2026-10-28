import { ApplicationError, invalidInput } from "../../applicationError";
import type { Orm, Transact, Tx } from "../../db";
import type { Deployment } from "../../env";
import type { SecretBox } from "../../secrets";
import { PrincipalSecurityContext, type SecurityContext } from "../../security";
import {
  checkOpenRouterKey,
  createResolvedDecisions,
  type Decisions,
  DecisionsError,
  type DecisionsSource,
  type OriginalFileRead,
} from "../../../integrations/ai";
import { instanceRepository } from "../db";
import { aiConfig, type AiConfig, type AiSource, type SavedAiSource } from "../domain";
import { createBroccoliAiTokens } from "./broccoliAiTokens";

/**
 * Where the instance sends AI decisions: the owner's choice on a self-hosted instance, Broccoli AI
 * with its instance credential on a managed one, which never sees or saves the choice.
 */
export interface AiSettings {
  /** The AI files are read with now; null on a managed instance. */
  read(ctx: SecurityContext): Promise<AiConfig | null>;
  /** Checks that the chosen source works, then saves it; a managed instance refuses. */
  save(ctx: SecurityContext, choice: AiChoice): Promise<AiConfig>;
  /** The model Broccoli asks on its own, sent where the settings point at each request. */
  decisions: Decisions;
  /** A model reading a file in full, once the owner allowed it. */
  originalFileReader: OriginalFileReader;
}

/** Reads a whole file with the AI the owner chose when allowing it, not the one chosen now. */
export interface OriginalFileReader {
  /** The provider the consent must name, resolved in the caller's transaction; null is managed. */
  readSource(ctx: SecurityContext, tx: Tx): Promise<AiSource | null>;
  /** `source` is the instance's AI source at the owner's consent; null on a managed instance. */
  readOriginalFile(source: AiSource | null, request: OriginalFileRead): Promise<unknown>;
}

/** The owner's choice of AI at setup. */
export interface AiChoice {
  source: AiSource;
  /** Replaces the saved key; blank counts as none. */
  openRouterKey?: string | null;
}

export function createAiSettings({
  orm,
  transact,
  secretBox,
  dataDir,
  deployment,
  openRouter,
  broccoliAiUrl,
}: {
  orm: Orm;
  transact: Transact;
  secretBox: SecretBox;
  dataDir: string;
  deployment: Deployment;
  /** OpenRouter's API, and `OPENROUTER_API_KEY` or null. */
  openRouter: { url: string; key: string | null };
  broccoliAiUrl: string;
}): AiSettings {
  const tokens = createBroccoliAiTokens({ orm, secretBox, dataDir });
  // Broccoli reads its AI source and token for decisions it makes on its own.
  const system = PrincipalSecurityContext.system();
  const readConfig = async (db: Orm | Tx) =>
    aiConfig(await readSavedAiSource(db, secretBox), openRouter.key);
  const managedSource = async (): Promise<DecisionsSource> => {
    const encrypted = await instanceRepository(orm).readInstanceCredential();
    if (encrypted === null) {
      throw new DecisionsError("The instance has no Broccoli AI credential before init", false);
    }
    return {
      kind: "broccoli_ai_instance",
      url: broccoliAiUrl,
      credential: secretBox.decrypt(encrypted),
    };
  };
  const decisions = createResolvedDecisions({
    readSource: async () =>
      deployment.mode === "managed"
        ? managedSource()
        : sourceOf(await readConfig(orm), broccoliAiUrl, openRouter.url),
    tokens: { read: () => tokens.read(system), save: (token) => tokens.save(system, token) },
  });
  return {
    read: async (ctx) => {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      return deployment.mode === "managed" ? null : readConfig(orm);
    },
    save: async (ctx, { source, openRouterKey }) => {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      if (deployment.mode === "managed") {
        throw new ApplicationError("CONFLICT", "A managed instance reads files with its own key.");
      }
      if (source === "external_agent") {
        // Choosing the external agent also ends its earlier sessions, which only its module does.
        throw invalidInput([{ field: "source", code: "invalid" }]);
      }
      const givenKey = openRouterKey?.trim() || undefined;
      if (source === "openrouter") {
        await checkOpenRouter(
          openRouter.url,
          givenKey ?? (await readConfig(orm)).openRouterKey?.key ?? null,
        );
      } else {
        await checkBroccoliAi(() => decisions.prepareBroccoliAi(broccoliAiUrl));
      }
      await transact((tx) =>
        instanceRepository(tx).storeAiSource(
          source,
          givenKey === undefined ? undefined : secretBox.encrypt(givenKey),
        ),
      );
      return readConfig(orm);
    },
    decisions,
    originalFileReader: {
      readSource: async (ctx, tx) => {
        ctx.requireSetupAccess("MANAGE_WORKSPACE");
        return deployment.mode === "managed" ? null : (await readConfig(tx)).source;
      },
      readOriginalFile: async (source, request) => {
        const config = await readConfig(orm);
        return decisions.readOriginalFile(
          deployment.mode === "managed"
            ? await managedSource()
            : sourceOf(source ? { ...config, source } : config, broccoliAiUrl, openRouter.url),
          request,
        );
      },
    },
  };
}

async function readSavedAiSource(orm: Orm | Tx, secretBox: SecretBox): Promise<SavedAiSource> {
  const { source, encryptedOpenRouterKey } = await instanceRepository(orm).readAiSource();
  return {
    source,
    openRouterKey:
      encryptedOpenRouterKey === null ? null : secretBox.decrypt(encryptedOpenRouterKey),
  };
}

function sourceOf(config: AiConfig, broccoliAiUrl: string, openRouterUrl: string): DecisionsSource {
  if (config.source === "external_agent") {
    // The owner's external agent answers its files itself; an older file's job has no model.
    throw new DecisionsError("The external agent reads the files", false);
  }
  return config.source === "broccoli_ai"
    ? { kind: "broccoli_ai", url: broccoliAiUrl }
    : openRouterSource(openRouterUrl, config.openRouterKey?.key ?? null);
}

function openRouterSource(url: string, key: string | null): DecisionsSource {
  if (key === null) {
    throw new DecisionsError("OpenRouter has no key", false);
  }
  return { kind: "openrouter", url, key };
}

async function checkOpenRouter(url: string, key: string | null): Promise<void> {
  if (key === null) {
    throw invalidInput([{ field: "openRouterKey", code: "required" }]);
  }
  try {
    await checkOpenRouterKey({ url, key });
  } catch (error) {
    throw refusalOf(error, () => invalidInput([{ field: "openRouterKey", code: "rejected" }]));
  }
}

async function checkBroccoliAi(prepare: () => Promise<void>): Promise<void> {
  try {
    await prepare();
  } catch (error) {
    throw refusalOf(error, (refusal) =>
      refusal.reason === "free_period_used"
        ? invalidInput([{ field: "source", code: "free_period_used" }])
        : unavailable(),
    );
  }
}

/** The payload error for a source's refusal; a retryable one says "try later". */
function refusalOf(error: unknown, final: (refusal: DecisionsError) => ApplicationError): unknown {
  if (!(error instanceof DecisionsError)) {
    return error;
  }
  return error.retryable ? unavailable() : final(error);
}

function unavailable(): ApplicationError {
  return new ApplicationError("UNAVAILABLE", "The AI service could not be reached. Try again.");
}
