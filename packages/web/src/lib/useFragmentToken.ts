import { useEffect, useState } from "react";

/** Reads and hides a link's token, reopening the page when another token arrives in the same tab. */
export function useFragmentToken(): string {
  const [token] = useState(() => window.location.hash.slice(1));
  useEffect(() => {
    window.history.replaceState(window.history.state, "", window.location.pathname);
    const reopen = () => {
      if (window.location.hash) window.location.reload();
    };
    window.addEventListener("hashchange", reopen);
    return () => window.removeEventListener("hashchange", reopen);
  }, []);
  return token;
}
