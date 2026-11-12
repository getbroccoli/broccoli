/** Why a person's agent connection ended, in its stored form. */
export const AGENT_CONNECTION_ENDINGS = [
  "disconnected_by_person",
  "replaced_by_another_agent",
  "ended_by_password_reset",
  "ended_after_30_days_unused",
] as const;

export type AgentConnectionEnding = (typeof AGENT_CONNECTION_ENDINGS)[number];
