import { useQuery } from "@apollo/client/react";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { AgentCallBubblesDocument, type AgentCallBubblesQuery } from "@/__generated__/graphql";
import { cn } from "@/lib/class-names";

import { agentActivityLabel } from "../agentActivityLabel";
import "./agentCallBubbles.css";
import { callsAfter } from "./callsAfter";

type Call = AgentCallBubblesQuery["myAgentActivity"]["edges"][number]["node"];

/**
 * Each call the person's agent makes from now on, as a bubble beside the menu dot (placed inside
 * the dot's box) that leaves after about 4 seconds. Decoration only: Your agent lists every call.
 */
export function AgentCallBubbles() {
  const calls = useQuery(AgentCallBubblesDocument, {
    fetchPolicy: "network-only",
  }).data?.myAgentActivity.edges.map(({ node }) => node);
  // undefined until the first read; the calls it finds are from before and never show.
  const [lastShownId, setLastShownId] = useState<string | null>();
  const [bubbles, setBubbles] = useState<Call[]>([]);
  if (calls) {
    if (lastShownId === undefined) {
      setLastShownId(calls[0]?.id ?? null);
    } else {
      // By id, so a read older than the last one shown adds nothing.
      const newCalls = callsAfter(calls, lastShownId);
      const newest = newCalls.at(-1);
      if (newest) {
        setBubbles([...bubbles, ...newCalls].slice(-OPACITIES.length));
        setLastShownId(newest.id);
      }
    }
  }

  const dot = useRef<HTMLSpanElement>(null);
  const [dotBox, setDotBox] = useState<DOMRect>();
  // The menu clips what overflows it, so the bubbles sit outside it, where the dot is now.
  useLayoutEffect(() => {
    if (bubbles.length === 0) return;
    const measureDot = () => setDotBox(dot.current?.getBoundingClientRect());
    measureDot();
    window.addEventListener("resize", measureDot);
    return () => window.removeEventListener("resize", measureDot);
  }, [bubbles]);

  return (
    <>
      <span ref={dot} aria-hidden className="absolute inset-0" />
      {bubbles.length > 0 &&
        dotBox &&
        createPortal(
          // Invisible rather than hidden, so a bubble still times out and never shows late.
          <div
            aria-hidden
            className="pointer-events-none fixed z-40 max-md:invisible motion-reduce:invisible"
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
                    {agentActivityLabel(call)}
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

/** How faint each bubble is, newest first; their count is the most shown at once. */
const OPACITIES = [1, 0.6, 0.35];
/** How far each older bubble sits above the newer one, in pixels. */
const STACK_STEP_PX = 30;
/** The gap between the dot and the bubbles, in pixels. */
const DOT_GAP_PX = 14;
