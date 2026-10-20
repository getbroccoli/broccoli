import {
  checkOpenRouterKey,
  createReferenceCompletions,
  createResolvedDecisions,
  DecisionsError,
  type DecisionsSource,
} from "../integrations/ai";
import { readAiConfig, readBroccoliAiToken, saveBroccoliAiToken } from "../core/instance";
import type { Mode } from "../core/env";
import type { ModuleDependencies, ModuleManifest } from "../core/moduleManifest";
import { companyModule } from "./company";
import { demoModule, prepareDemoFill } from "./demo";
import { employeesModule } from "./employees";
import { importsModule, PDF_COMPLETION_TASKS } from "./imports";
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
  const readSource = () => decisionsSource(core, mode, ai);
  const decisions = createResolvedDecisions({
    readSource,
    tokens: {
      read: () => readBroccoliAiToken(core.orm, core.secretBox),
      save: (token) => saveBroccoliAiToken(core.orm, core.secretBox, token),
    },
  });
  return [
    systemModule({
      ...core,
      mode,
      ai: {
        environmentKey: ai.openRouterKey,
        checkOpenRouterKey: (key) => checkOpenRouterKey({ url: ai.openRouterUrl, key }),
        prepareBroccoliAi: () => decisions.prepareBroccoliAi(broccoliAiUrlOf(ai)),
      },
    }),
    employeesModule({ orm: core.orm }),
    companyModule({ ...core, brandLookupUrl }),
    demoModule({ orm: core.orm, transact: core.transact }),
    slackModule({ slackConnection, orm: core.orm, mode, publicUrl }),
    importsModule({
      ...core,
      slack: slackConnection,
      decisions,
      completions: createReferenceCompletions({ readSource, tasks: PDF_COMPLETION_TASKS }),
      prepareDemoFill: () => prepareDemoFill(),
    }),
  ];
}

/** Where this request's decisions or completions go, for the AI `readAiConfig` picks. */
async function decisionsSource(
  { orm, secretBox }: ModuleDependencies,
  mode: Mode,
  settings: ModuleSettings["ai"],
): Promise<DecisionsSource> {
  const ai = await readAiConfig(orm, secretBox, { mode, environmentKey: settings.openRouterKey });
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
