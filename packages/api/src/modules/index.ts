import { createResolvedDecisions, type DecisionsSource } from "../integrations/ai";
import { readBroccoliAiToken, saveBroccoliAiToken } from "../core/instance";
import type { Mode } from "../core/env";
import type { ModuleDependencies, ModuleManifest } from "../core/moduleManifest";
import { companyModule } from "./company";
import { demoModule } from "./demo";
import { employeesModule } from "./employees";
import { importsModule } from "./imports";
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
  return [
    systemModule({ orm: core.orm, mode }),
    employeesModule({ orm: core.orm }),
    companyModule({ ...core, brandLookupUrl }),
    demoModule({ orm: core.orm, transact: core.transact }),
    slackModule({ slackConnection, orm: core.orm, mode, publicUrl }),
    importsModule({
      ...core,
      slack: slackConnection,
      decisions: createResolvedDecisions({
        readSource: () => Promise.resolve(decisionsSource(ai)),
        tokens: {
          read: () => readBroccoliAiToken(core.orm, core.secretBox),
          save: (token) => saveBroccoliAiToken(core.orm, core.secretBox, token),
        },
      }),
    }),
  ];
}

/** The install's own OpenRouter key when it has one; the owner's choice joins here later. */
function decisionsSource({
  openRouterUrl,
  openRouterKey,
  broccoliAiUrl,
}: ModuleSettings["ai"]): DecisionsSource {
  if (openRouterKey !== null) {
    return { kind: "openrouter", url: openRouterUrl, key: openRouterKey };
  }
  if (broccoliAiUrl === null) {
    throw new Error("A managed instance needs its OpenRouter key");
  }
  return { kind: "broccoli_ai", url: broccoliAiUrl };
}
