/** Where an instance sends AI decisions. */
export const AI_SOURCES = ["broccoli_ai", "openrouter"] as const;

export type AiSource = (typeof AI_SOURCES)[number];

/** What the owner chose at setup; both null until they choose. */
export interface SavedAiSource {
  source: AiSource | null;
  openRouterKey: string | null;
}

export type OpenRouterKeyOrigin = "environment" | "saved";

/** The AI files are read with now, and the OpenRouter key it would use. */
export interface AiConfig {
  source: AiSource;
  openRouterKey: { key: string; origin: OpenRouterKeyOrigin } | null;
}

/**
 * A self-hosted instance's AI: the saved source, else OpenRouter when any key exists, else
 * Broccoli AI; a saved key beats the environment's, since the owner pasted it on purpose.
 */
export function aiConfig(saved: SavedAiSource, environmentKey: string | null): AiConfig {
  const openRouterKey =
    saved.openRouterKey !== null
      ? { key: saved.openRouterKey, origin: "saved" as const }
      : environmentKey !== null
        ? { key: environmentKey, origin: "environment" as const }
        : null;
  return {
    source: saved.source ?? (openRouterKey ? "openrouter" : "broccoli_ai"),
    openRouterKey,
  };
}
