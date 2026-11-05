import { useRouter } from "@tanstack/react-router";
import { useRef } from "react";

/**
 * A dropdown menu's open handler and final focus: focus returns to the trigger unless an
 * item changed the page, in which case the new page's heading takes it (see
 * `useFocusHeadingOnNavigation`).
 */
export function useMenuFinalFocus() {
  const router = useRouter();
  const openedOnPath = useRef<string | null>(null);
  return {
    onOpenChange: (open: boolean) => {
      if (open) {
        openedOnPath.current = router.state.location.pathname;
      }
    },
    finalFocus: () => router.state.location.pathname === openedOnPath.current,
  };
}
