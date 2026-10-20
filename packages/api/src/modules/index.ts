import {
  checkOpenRouterKey,
  createResolvedDecisions,
  DecisionsError,
  type DecisionsSource,
} from "../integrations/ai";
import { type AiSettings, createAiSettings, createBroccoliAiTokens } from "../core/instance";
import type { Deployment } from "../core/env";
import { PrincipalSecurityContext, type SecurityContext } from "../core/security";
import type { ModuleDependencies, Modules } from "../core/moduleManifest";
import { companyModule } from "./company";
import { demoModule, prepareDemoFill } from "./demo";
import { deleteAllEmployees, employeesModule } from "./employees";
import { importsModule, prepareDemoStart } from "./imports";
import { createSlack, slackModule, type SlackUrls } from "./slack";
import { systemModule } from "./system";

/** Settings that only some modules need, read from the environment by `main.ts`. */
export interface ModuleSettings {
  deployment: Deployment;
  brandLookupUrl: string | null;
  slack: SlackUrls;
  /** Where AI decisions go with an OpenRouter key. */
  ai: { openRouterUrl: string; openRouterKey: string | null };
}

/** Every module of the API, each given only the dependencies it uses. */
export function createModules(
  core: ModuleDependencies,
  { deployment, brandLookupUrl, slack, ai: openRouter }: ModuleSettings,
): Modules {
  const { mode } = deployment;
  const ai = {
    ...openRouter,
    broccoliAiUrl: deployment.mode === "self_hosted" ? deployment.broccoliAiUrl : null,
  };
  // Built once: the Slack module serves it and the import reads Slack through it.
  const slackConnection = createSlack({ ...core, slack });
  const aiSettings = createAiSettings({ ...core, mode, environmentKey: ai.openRouterKey });
  const tokens = createBroccoliAiTokens(core);
  // Broccoli reads its AI source and token for decisions it makes on its own.
  const system = PrincipalSecurityContext.system();
  const decisions = createResolvedDecisions({
    readSource: () => decisionsSource(system, aiSettings, ai),
    tokens: { read: () => tokens.read(system), save: (token) => tokens.save(system, token) },
  });
  const manifests = [
    systemModule({
      ...core,
      mode,
      aiSettings,
      ai: {
        checkOpenRouterKey: (key) => checkOpenRouterKey({ url: ai.openRouterUrl, key }),
        prepareBroccoliAi: () => decisions.prepareBroccoliAi(broccoliAiUrlOf(ai)),
      },
    }),
    employeesModule({ orm: core.orm }),
    companyModule({ ...core, brandLookupUrl }),
    demoModule({ orm: core.orm, transact: core.transact }),
    slackModule(slackConnection),
    importsModule({
      ...core,
      slack: slackConnection,
      decisions,
      prepareDemoFill: () => prepareDemoFill(),
    }),
  ];
  return {
    manifests,
    setupDemo: {
      prepareStart: () => prepareDemoStart({ prepareDemoFill: () => prepareDemoFill() }),
      deleteAllEmployees,
    },
  };
}

/** Where this request's decisions go, for the AI the settings pick. */
async function decisionsSource(
  ctx: SecurityContext,
  aiSettings: AiSettings,
  settings: AiUrls,
): Promise<DecisionsSource> {
  const ai = await aiSettings.read(ctx);
  if (ai.source === "broccoli_ai") {
    return { kind: "broccoli_ai", url: broccoliAiUrlOf(settings) };
  }
  if (ai.openRouterKey === null) {
    throw new DecisionsError("OpenRouter has no key", false);
  }
  return { kind: "openrouter", url: settings.openRouterUrl, key: ai.openRouterKey.key };
}

function broccoliAiUrlOf({ broccoliAiUrl }: AiUrls): string {
  if (broccoliAiUrl === null) {
    throw new Error("Only a self-hosted instance uses Broccoli AI");
  }
  return broccoliAiUrl;
}

type AiUrls = ModuleSettings["ai"] & { broccoliAiUrl: string | null };
