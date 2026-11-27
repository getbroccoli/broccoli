import { useRouter } from "@tanstack/react-router";
import { useState, useTransition } from "react";

import { ACTING_AS_CHANNEL } from "./useReloadWhenActingChanges";

/** Counts switches in this page, so each one's visit to Today is told apart from any other. */
let switches = 0;

/**
 * Runs an action that changes whom the session acts as, then loads Today afresh in every tab, so
 * nothing a page holds for one person shows as the other; `pending` lasts until the page unloads.
 * It opens Today first, so an unsaved edit asks to be discarded before anything changes; keeping
 * the edit cancels the switch for good. One whose action returns false sets `failed`.
 */
export function useActingAsChange<Args extends unknown[]>(
  action: (...args: Args) => Promise<boolean>,
) {
  const router = useRouter();
  const [running, startTransition] = useTransition();
  const [leaving, setLeaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const switchNow = (args: Args) =>
    startTransition(async () => {
      setFailed(false);
      if (!(await action(...args))) {
        setFailed(true);
        return;
      }
      setLeaving(true);
      new BroadcastChannel(ACTING_AS_CHANNEL).postMessage("changed");
      window.location.replace("/");
    });

  const change = (...args: Args) => {
    const visit = `switch-${++switches}`;
    // A kept edit leaves this navigation unsettled, and a later visit to Today carries no hash.
    void router.navigate({ to: "/", hash: visit }).then(() => {
      if (router.state.location.hash === visit) switchNow(args);
    });
  };

  return { change, pending: running || leaving, failed };
}
