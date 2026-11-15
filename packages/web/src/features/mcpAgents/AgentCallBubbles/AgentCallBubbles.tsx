import { useQuery } from "@apollo/client/react";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { AgentCallBubblesDocument, type AgentCallBubblesQuery } from "@/__generated__/graphql";
import { cn } from "@/lib/class-names";

import { labelOf } from "../agentActivityLabel";
import "./agentCallBubbles.css";
import { callsAfter } from "./callsAfter";

/** How faint each bubble is, newest first; their count is the most shown at once. */
const OPACITIES = [1, 0.6, 0.35];
/** How far each older bubble sits above the newer one, in pixels. */
const STACK_STEP_PX = 30;
/** The gap between the dot and the bubbles, in pixels. */
const DOT_GAP_PX = 14;

type Call = AgentCallBubblesQuery["myAgentActivity"]["edges"][number]["node"];

/**
 * Each call the person's agent makes from now on, as a small bubble beside the menu dot that
 * leaves by itself after about 4 seconds. Goes inside the dot's box; the shell's live stream reads
 * the calls again on each call. Only decoration: Your agent lists every call for screen readers,
 * and no bubble shows under reduced motion or on narrow screens, where the menu scrolls sideways.
 */
export function AgentCallBubbles() {
  const calls = useQuery(AgentCallBubblesDocument, {
    fetchPolicy: "network-only",
  }).data?.myAgentActivity.edges.map(({ node }) => node);
  // undefined until the first read; the calls it finds are from before and never show.
  const [lastShownId, setLastShownId] = useState<string | null>();
  const [bubbles, setBubbles] = useState<Call[]>([]);
  const newestId = calls?.[0]?.id ?? null;
  if (calls && newestId !== lastShownId) {
    if (lastShownId !== undefined) {
      setBubbles([...bubbles, ...callsAfter(calls, lastShownId)].slice(-OPACITIES.length));
    }
    setLastShownId(newestId);
  }

  const dot = useRef<HTMLSpanElement>(null);
  const [dotBox, setDotBox] = useState<DOMRect>();
  const showing = bubbles.length > 0;
  // The menu clips what overflows it, so the bubbles sit outside it, where the dot is now.
  useLayoutEffect(() => {
    if (showing) setDotBox(dot.current?.getBoundingClientRect());
  }, [showing]);

  return (
    <>
      <span ref={dot} aria-hidden className="absolute inset-0" />
      {showing &&
        dotBox &&
        createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed z-40 max-md:hidden motion-reduce:hidden"
            style={{ left: dotBox.right + DOT_GAP_PX, top: dotBox.top + dotBox.height / 2 }}
          >
            {bubbles.map((call, index) => {
              const rank = bubbles.length - 1 - index;
              return (
                <span
                  key={call.id}
                  className="absolute left-0 translate-y-1/2 transition-[bottom,opacity] duration-300 ease-out"
                  style={{ bottom: rank * STACK_STEP_PX, opacity: OPACITIES[rank] }}
                >
                  <span
                    className={cn(
                      "agent-call-bubble block rounded-[12px_12px_12px_4px] border border-brand/20 bg-brand-soft px-2.5 py-1 text-xs font-medium whitespace-nowrap",
                      call.outcome === "ANSWERED_BY_BROCCOLI"
                        ? "text-brand-deep"
                        : "text-foreground",
                    )}
                    onAnimationEnd={() =>
                      setBubbles((shown) => shown.filter(({ id }) => id !== call.id))
                    }
                  >
                    {labelOf(call)}
                  </span>
                </span>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
