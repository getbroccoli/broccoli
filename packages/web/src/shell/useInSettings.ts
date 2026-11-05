import { useRouterState } from "@tanstack/react-router";

/** Whether a settings page is open, which turns the frame into the Settings place. */
export function useInSettings(): boolean {
  return useRouterState({ select: (state) => state.location.pathname.startsWith("/settings") });
}
