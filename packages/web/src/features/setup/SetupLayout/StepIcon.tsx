import { CheckCircle, Circle } from "@phosphor-icons/react";

import type { StepState } from "./setup-steps";

/** A filled check for a done step, a ringed dot for the current one, a circle for later. */
export function StepIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return <CheckCircle size={18} weight="fill" className="shrink-0 text-brand" aria-hidden />;
  }
  if (state === "current") {
    return (
      <span
        aria-hidden
        className="flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-foreground"
      >
        <span className="size-2 rounded-full bg-foreground" />
      </span>
    );
  }
  return <Circle size={18} className="shrink-0" aria-hidden />;
}
