import type { SecurityContext } from "../../../core/security";
import { type AgentContext, asLiveAgent } from "./agentContext";

/** The parsed way: the external agent reads the original files itself and sends their people. */
export interface ParsedWayService {
  /** Adds the people of one file the agent read; returns the new source's id and counts. */
  importPeople(
    ctx: SecurityContext,
    file: { name: unknown; people: unknown },
  ): Promise<{ id: string; people: number; skipped: number }>;
}

export function createParsedWayService(context: AgentContext): ParsedWayService {
  return {
    importPeople: (ctx, file) =>
      asLiveAgent(context, ctx, "parses_original_files", (tx) =>
        context.imports.parsedSources.addParsedSource(ctx, tx, file),
      ),
  };
}
