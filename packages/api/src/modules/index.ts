import {
  checkOpenRouterKey,
  createResolvedDecisions,
  DecisionsError,
  type DecisionsSource,
} from "../integrations/ai";
import { type AiSettings, createAiSettings, createBroccoliAiTokens } from "../core/instance";
import type { Mode } from "../core/env";
import { PrincipalSecurityContext, type SecurityContext } from "../core/security";
import type { ModuleDependencies, ModuleManifest } from "../core/moduleManifest";
import { companyModule } from "./company";
import { demoModule, prepareDemoFill } from "./demo";
import { employeesModule } from "./employees";
import { externalAgentsModule } from "./externalAgents";
import { createImportUseCases, importsModule } from "./imports";
import { createSlack, slackModule, type SlackUrls } from "./slack";
import { systemModule } from "./system";

/** Settings that only some modules need, read from the environment by `main.ts`. */
export interface ModuleSettings {
  mode: Mode;
  /** Self-hosted only: the address browsers use. */
  publicUrl?: string;
  brandLookupUrl: string | null;
  slack: SlackUrls;
  /** Where AI decisions go: OpenRouter with a key, else Broccoli AI (self-hosted only). */
  ai: { openRouterUrl: string; openRouterKey: string | null; broccoliAiUrl: string | null };
}

/** Every module of the API, each given only the dependencies it uses. */
export function createModules(
  core: ModuleDependencies,
  { mode, publicUrl, brandLookupUrl, slack, ai }: ModuleSettings,
): ModuleManifest[] {
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
  const prepareImportDemoFill = () => prepareDemoFill();
  // Built once: the import serves them and the external agent puts its files through them.
  const importUseCases = createImportUseCases({
    ...core,
    slack: slackConnection,
    decisions,
    prepareDemoFill: prepareImportDemoFill,
  });
  return [
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
    slackModule({ slackConnection, orm: core.orm, mode, publicUrl }),
    importsModule({
      orm: core.orm,
      useCases: importUseCases,
      prepareDemoFill: prepareImportDemoFill,
    }),
    externalAgentsModule({ ...core, mode, imports: importUseCases }),
  ];
}

/** Where this request's decisions go, for the AI the settings pick. */
async function decisionsSource(
  ctx: SecurityContext,
  aiSettings: AiSettings,
  settings: ModuleSettings["ai"],
): Promise<DecisionsSource> {
  const ai = await aiSettings.read(ctx);
  if (ai.source === "agent") {
    // The owner's external agent answers its files itself; an older file's job has no model.
    throw new DecisionsError("The external agent reads the files", false);
  }
  if (ai.source === "broccoli_ai") {
    return { kind: "broccoli_ai", url: broccoliAiUrlOf(settings) };
  }
  if (ai.openRouterKey === null) {
    throw new DecisionsError("OpenRouter has no key", false);
  }
  return { kind: "openrouter", url: settings.openRouterUrl, key: ai.openRouterKey.key };
}

function broccoliAiUrlOf({ broccoliAiUrl }: ModuleSettings["ai"]): string {
  if (broccoliAiUrl === null) {
    throw new Error("Only a self-hosted instance uses Broccoli AI");
  }
  return broccoliAiUrl;
}
