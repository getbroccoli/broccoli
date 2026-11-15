import { Check, type Icon, Prohibit, WarningCircle } from "@phosphor-icons/react";

import type { AgentActivityOutcome } from "@/__generated__/graphql";
import type { MessageKey } from "@/i18n";

/** How each outcome of an agent call looks: its icon, its tile and badge colours, and its badge. */
export const OUTCOME_LOOKS = {
  ANSWERED_BY_BROCCOLI: {
    Icon: Check,
    tile: "bg-brand-soft text-brand-deep",
    badge: null,
  },
  REFUSED_BY_BROCCOLI: {
    Icon: Prohibit,
    tile: "bg-muted text-foreground",
    badge: "mcpAgents.activity.refused",
  },
  FAILED_IN_BROCCOLI: {
    Icon: WarningCircle,
    tile: "bg-amber-50 text-amber-800",
    badge: "mcpAgents.activity.failed",
  },
} satisfies Record<AgentActivityOutcome, Look>;

type Look = { Icon: Icon; tile: string; badge: MessageKey | null };
