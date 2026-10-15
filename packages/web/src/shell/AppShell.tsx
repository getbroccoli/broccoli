import { useRef, type ReactNode } from "react";

import { DemoBanner } from "@/features/demo";

import { LeftNav } from "./LeftNav";
import { useFocusHeadingOnNavigation } from "./useFocusHeadingOnNavigation";

/**
 * The window-sized app frame: navigation above or beside the Canvas, a card that
 * owns its own scroll. The document itself never scrolls.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const main = useRef<HTMLElement>(null);
  useFocusHeadingOnNavigation(main);

  return (
    <div className="surface-grain flex h-dvh w-full flex-col overflow-hidden bg-app-backdrop md:flex-row">
      <LeftNav />
      <main ref={main} className="flex min-h-0 min-w-0 flex-1 p-2 pt-0 md:p-3">
        <div className="w-full overflow-y-auto rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.04)]">
          <div className="mx-auto px-4 py-6 md:px-8 md:py-8">
            <DemoBanner />
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
