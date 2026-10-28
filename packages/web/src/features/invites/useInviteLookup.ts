import { useEffect, useState } from "react";

import { type InviteDetails, lookUpInvite } from "./inviteApi";

/** The invite page's state: loading, the invite, or a link that does not open one. */
export type InviteLookup =
  | { state: "loading" }
  | { state: "invalid" }
  | { state: "failed" }
  | { state: "found"; token: string; details: InviteDetails };

/** Reads the token from the link's fragment, clears it from the address bar, and looks it up. */
export function useInviteLookup(): InviteLookup {
  const [token] = useState(() => window.location.hash.slice(1));
  const [lookup, setLookup] = useState<InviteLookup>(
    token ? { state: "loading" } : { state: "invalid" },
  );
  useEffect(() => {
    window.history.replaceState(window.history.state, "", window.location.pathname);
    if (!token) return;
    let current = true;
    void lookUpInvite(token).then((result) => {
      if (!current) return;
      setLookup(
        typeof result === "string" ? { state: result } : { state: "found", token, details: result },
      );
    });
    return () => {
      current = false;
    };
  }, [token]);
  return lookup;
}
