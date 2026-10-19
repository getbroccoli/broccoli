/** Where a self-hosted instance sends AI decisions. */
export const AI_SOURCES = ["broccoli_ai", "openrouter"] as const;

export type AiSource = (typeof AI_SOURCES)[number];

/** What the owner chose at setup; both null until they choose. */
export interface AiChoice {
  source: AiSource | null;
  openRouterKey: string | null;
}

export type OpenRouterKeyOrigin = "environment" | "saved";

/** The source files are read with now, and the OpenRouter key it would use. */
export interface CurrentAi {
  source: AiSource;
  openRouterKey: { key: string; origin: OpenRouterKeyOrigin } | null;
}

/**
 * Self-hosted: the owner's choice, else OpenRouter when any key exists, else Broccoli AI.
 * A saved key beats the environment's, since the owner pasted it on purpose.
 */
export function currentAi(choice: AiChoice, environmentKey: string | null): CurrentAi {
  const openRouterKey =
    choice.openRouterKey !== null
      ? { key: choice.openRouterKey, origin: "saved" as const }
      : environmentKey !== null
        ? { key: environmentKey, origin: "environment" as const }
        : null;
  return {
    source: choice.source ?? (openRouterKey ? "openrouter" : "broccoli_ai"),
    openRouterKey,
  };
}
