import { useRef, type ReactNode } from "react";

import { LeftNav } from "./LeftNav";
import { useFocusHeadingOnNavigation } from "./useFocusHeadingOnNavigation";

/**
 * The window-sized app frame: navigation on the left and the Canvas, a card that
 * owns its own scroll. The document itself never scrolls.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const main = useRef<HTMLElement>(null);
  useFocusHeadingOnNavigation(main);

  return (
    <div className="surface-grain flex h-dvh w-full overflow-hidden bg-app-backdrop">
      <LeftNav />
      <main ref={main} className="flex min-w-0 flex-1 p-3">
        <div className="w-full overflow-y-auto rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.04)]">
          <div className="mx-auto px-8 py-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
