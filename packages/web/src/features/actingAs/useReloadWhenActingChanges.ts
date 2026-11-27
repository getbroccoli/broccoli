import { useEffect } from "react";

import { markSessionStale } from "@/apollo";

/** The channel on which a tab tells the others that whom the session acts as changed. */
export const ACTING_AS_CHANNEL = "broccoli-acting-as";

/**
 * Reloads this tab when another tab changes whom the session acts as, so it never shows one person
 * while acting as another; until it reloads, or when an unsaved edit keeps it, it sends nothing.
 */
export function useReloadWhenActingChanges() {
  useEffect(() => {
    const channel = new BroadcastChannel(ACTING_AS_CHANNEL);
    channel.onmessage = () => {
      markSessionStale();
      window.location.reload();
    };
    return () => channel.close();
  }, []);
}
