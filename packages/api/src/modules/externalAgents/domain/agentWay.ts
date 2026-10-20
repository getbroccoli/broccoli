/**
 * How the owner's external agent may work, chosen by the owner per agent one-time code: answer
 * Broccoli's masked questions about files the owner drops, or read the original files itself.
 */
export const AGENT_WAYS = ["answers_masked_questions", "parses_original_files"] as const;

export type AgentWay = (typeof AGENT_WAYS)[number];
