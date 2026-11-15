/** How Broccoli ended one tool call of a person's agent, in its stored form. */
export const AGENT_ACTIVITY_OUTCOMES = [
  "answered_by_broccoli",
  "refused_by_broccoli",
  "failed_in_broccoli",
] as const;

export type AgentActivityOutcome = (typeof AGENT_ACTIVITY_OUTCOMES)[number];
