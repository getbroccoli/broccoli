/** Where an instance sends AI decisions; `external_agent` is the owner's external agent, which answers instead. */
export const AI_SOURCES = ["broccoli_ai", "openrouter", "external_agent"] as const;

export type AiSource = (typeof AI_SOURCES)[number];
