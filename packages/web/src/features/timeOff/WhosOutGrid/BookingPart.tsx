import { tileStyle } from "@/features/termsDisplay";
import { cn } from "@/lib/class-names";

import type { BarPart } from "../barParts";
import { bookingTooltip } from "../timeOffText";
import type { WhosOutTimeOff } from "./WhosOutGrid";

type Props = {
  timeOff: WhosOutTimeOff;
  part: BarPart;
  onOpen: () => void;
};

/** One day's part of a booking's bar, hatched while it waits for approval, which opens the booking. */
export function BookingPart({ timeOff, part, onOpen }: Props) {
  const { dayPart, roundStart, roundEnd } = part;
  const half = dayPart !== "FULL_DAY";
  const label = bookingTooltip({
    typeName: timeOff.timeOffType?.name ?? null,
    startDate: timeOff.startDate,
    endDate: timeOff.endDate,
    cost: timeOff.cost ?? null,
    status: timeOff.status ?? null,
  });
  const colour = timeOff.timeOffType && tileStyle(timeOff.timeOffType.colour).background;
  // A request waiting for approval is hatched in its type's colour; only who may read it sees it.
  const style = !colour
    ? undefined
    : timeOff.status === "REQUESTED"
      ? {
          background: `repeating-linear-gradient(45deg, ${colour} 0 3px, transparent 3px 6px)`,
          boxShadow: `inset 0 0 0 1.5px ${colour}`,
        }
      : { background: colour };
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onOpen}
      style={style}
      className={cn(
        "absolute inset-y-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        !timeOff.timeOffType && "bg-muted-foreground/30",
        dayPart === "MORNING"
          ? "right-1/2 left-0"
          : dayPart === "AFTERNOON"
            ? "right-0 left-1/2"
            : "inset-x-0",
        // A half cell keeps a narrower gap, so a lone half day stays wide enough to see and click.
        roundStart && (half ? "ml-0.5 rounded-l-full" : "ml-1 rounded-l-full"),
        roundEnd && (half ? "mr-0.5 rounded-r-full" : "mr-1 rounded-r-full"),
      )}
    />
  );
}
