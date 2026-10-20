import { useRouter } from "@tanstack/react-router";
import { useTransition } from "react";

/**
 * Runs an action, then reloads the route, or runs `then` in its place; `pending` lasts
 * until the next page renders, so the button doesn't come back in between. An action
 * that throws or returns false stops there, leaving its error to the caller.
 */
export function useRouteAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<unknown>, then = () => router.invalidate()) =>
    startTransition(async () => {
      try {
        if ((await action()) === false) return;
      } catch {
        return;
      }
      await then();
    });

  return [run, pending] as const;
}
