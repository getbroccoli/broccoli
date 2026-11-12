import { useRef, type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { DemoBanner } from "@/features/demo";
import { useLiveAgentConnection } from "@/features/mcpAgents";

import { cn } from "@/lib/class-names";

import { LeftNav } from "./LeftNav";
import { useFocusHeadingOnNavigation } from "./useFocusHeadingOnNavigation";
import { useInSettings } from "./useInSettings";

/**
 * The window-sized app frame: navigation above or beside the Canvas, a card that
 * owns its own scroll. The document itself never scrolls.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const main = useRef<HTMLElement>(null);
  const inSettings = useInSettings();
  useFocusHeadingOnNavigation(main);
  useLiveAgentConnection();

  return (
    <>
      <div
        className={cn(
          "surface-grain flex h-dvh w-full flex-col overflow-hidden transition-colors duration-500 motion-reduce:transition-none md:flex-row",
          inSettings ? "bg-settings-backdrop" : "bg-app-backdrop",
        )}
      >
        <LeftNav />
        <main ref={main} className="flex min-h-0 min-w-0 flex-1 p-2 pt-0 md:p-3">
          <div
            className={cn(
              "w-full overflow-y-auto rounded-2xl border border-border bg-card transition-shadow duration-500 motion-reduce:transition-none",
              // In Settings the card lifts off the darker backdrop.
              inSettings
                ? "shadow-[0_1px_3px_rgba(33,30,23,0.06),0_18px_50px_rgba(33,30,23,0.12)]"
                : "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.04)]",
            )}
          >
            <div className="mx-auto px-4 py-6 md:px-8 md:py-8">
              <DemoBanner />
              {children}
            </div>
          </div>
        </main>
      </div>
      {/* Outside the frame, whose isolation would keep toasts under panels and dialogs. */}
      <Toaster position="top-center" />
    </>
  );
}
