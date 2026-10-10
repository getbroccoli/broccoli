import { useRouter } from "@tanstack/react-router";
import { useEffect, type RefObject } from "react";

/**
 * After a client-side navigation, moves focus to the new page's `h1`, so screen readers
 * announce the destination and keyboard users continue from the top of the page. The
 * first page load keeps the browser's default focus.
 */
export function useFocusHeadingOnNavigation(container: RefObject<HTMLElement | null>): void {
  const router = useRouter();

  useEffect(
    () =>
      router.subscribe("onRendered", ({ fromLocation, pathChanged }) => {
        if (!fromLocation || !pathChanged) {
          return;
        }
        container.current?.querySelector("h1")?.focus({ preventScroll: true });
      }),
    [router, container],
  );
}
