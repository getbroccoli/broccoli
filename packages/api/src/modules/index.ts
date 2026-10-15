import { createDecisions } from "../integrations/ai";
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
  /** The model that maps files: the provider's address and key; null without a key. */
  model: { url: string; apiKey: string } | null;
}

/** Every module of the API, each given only the dependencies it uses. */
export function createModules(
  core: ModuleDependencies,
  { mode, publicUrl, brandLookupUrl, slack, model }: ModuleSettings,
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
      decisions: model && createDecisions(model),
    }),
  ];
}
