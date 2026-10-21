import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Orm, Transact } from "../../../core/db";
import type { Deployment, SelfHostedDeployment } from "../../../core/env";
import { readAiSource, saveAiSource } from "../../../core/instance";
import type { SecretBox } from "../../../core/secrets";
import { PrincipalSecurityContext, type SecurityContext } from "../../../core/security";
import {
  checkOpenRouterKey,
  createResolvedDecisions,
  type Decisions,
  DecisionsError,
  type DecisionsSource,
} from "../../../integrations/ai";
import { aiConfig, type AiConfig, type SavedAiSource } from "../domain";
import { createBroccoliAiTokens } from "./broccoliAiTokens";

/**
 * Where the instance sends AI decisions: the owner's choice on a self-hosted instance, Broccoli's
 * key on a managed one, which never sees or saves the choice.
 */
export interface AiSettings {
  /** The AI files are read with now; null on a managed instance. */
  read(ctx: SecurityContext): Promise<AiConfig | null>;
  /** Checks that the chosen source works, then saves it; a managed instance refuses. */
  save(ctx: SecurityContext, choice: AiChoice): Promise<AiConfig>;
  /** The model Broccoli asks on its own, sent where the settings point at each request. */
  decisions: Decisions;
}

/** The owner's choice of a model at setup; the external agent is chosen through its own module. */
export interface AiChoice {
  source: "broccoli_ai" | "openrouter";
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
}: {
  orm: Orm;
  transact: Transact;
  secretBox: SecretBox;
  dataDir: string;
  deployment: Deployment;
  /** OpenRouter's API, and `OPENROUTER_API_KEY` or null. */
  openRouter: { url: string; key: string | null };
}): AiSettings {
  const tokens = createBroccoliAiTokens({ orm, secretBox, dataDir });
  // Broccoli reads its AI source and token for decisions it makes on its own.
  const system = PrincipalSecurityContext.system();
  const readConfig = async (ctx: SecurityContext) =>
    aiConfig(await readSavedAiSource(ctx, orm, secretBox), openRouter.key);
  const decisions = createResolvedDecisions({
    readSource: async () =>
      deployment.mode === "managed"
        ? openRouterSource(openRouter.url, openRouter.key)
        : sourceOf(await readConfig(system), deployment, openRouter.url),
    tokens: { read: () => tokens.read(system), save: (token) => tokens.save(system, token) },
  });
  return {
    read: async (ctx) => {
      ctx.requireSetupAccess();
      return deployment.mode === "managed" ? null : readConfig(ctx);
    },
    save: async (ctx, { source, openRouterKey }) => {
      ctx.requireSetupAccess();
      if (deployment.mode === "managed") {
        throw new ApplicationError("CONFLICT", "A managed instance reads files with its own key.");
      }
      const givenKey = openRouterKey?.trim() || undefined;
      if (source === "openrouter") {
        await checkOpenRouter(
          openRouter.url,
          givenKey ?? (await readConfig(ctx)).openRouterKey?.key ?? null,
        );
      } else {
        await checkBroccoliAi(() => decisions.prepareBroccoliAi(deployment.broccoliAiUrl));
      }
      await transact((tx) =>
        saveAiSource(
          ctx,
          tx,
          source,
          givenKey === undefined ? undefined : secretBox.encrypt(givenKey),
        ),
      );
      return readConfig(ctx);
    },
    decisions,
  };
}

async function readSavedAiSource(
  ctx: SecurityContext,
  orm: Orm,
  secretBox: SecretBox,
): Promise<SavedAiSource> {
  const { source, encryptedOpenRouterKey } = await readAiSource(ctx, orm);
  return {
    source,
    openRouterKey:
      encryptedOpenRouterKey === null ? null : secretBox.decrypt(encryptedOpenRouterKey),
  };
}

function sourceOf(
  config: AiConfig,
  { broccoliAiUrl }: SelfHostedDeployment,
  openRouterUrl: string,
): DecisionsSource {
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
