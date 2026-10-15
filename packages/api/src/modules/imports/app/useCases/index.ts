import type { ModuleDependencies } from "../../../../core/moduleManifest";
import type { SecurityContext } from "../../../../core/security";
import { importRepository } from "../../db";
import type { SlackReader } from "./importContext";
import { createImportReadService } from "./importReadService";
import { readSlack } from "./readSlack";
import { skipImport } from "./skipImport";

export type { SlackReader } from "./importContext";

/** Everything that can be done with the import; the adapters call nothing else. */
export function createImportUseCases({
  orm,
  transact,
  slack,
}: Pick<ModuleDependencies, "orm" | "transact"> & { slack: SlackReader }) {
  const imports = importRepository(orm);
  const context = { transact, slack, imports };
  return {
    readSlack: (ctx: SecurityContext) => readSlack(context, ctx),
    skipImport: (ctx: SecurityContext) => skipImport(context, ctx),
    ...createImportReadService(imports),
  };
}

export type ImportUseCases = ReturnType<typeof createImportUseCases>;
