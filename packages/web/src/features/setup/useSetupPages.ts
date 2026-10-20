import { useRouteContext } from "@tanstack/react-router";

import { nextPage, previousPage, type SetupStepId } from "./SetupLayout";

/**
 * The pages before and after `page` in this instance's setup flow; no previous one when
 * the owner cannot go back from `page`.
 */
export function useSetupPages(page: SetupStepId) {
  const { mode } = useRouteContext({ from: "__root__" });
  return { previous: previousPage(page, mode), next: nextPage(page, mode) };
}
