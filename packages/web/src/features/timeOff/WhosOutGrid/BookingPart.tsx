import { tileStyle } from "@/features/termsDisplay";
import { cn } from "@/lib/class-names";

import { bookingTooltip } from "../timeOffText";
import type { WhosOutTimeOff } from "./WhosOutGrid";

type Props = {
  timeOff: WhosOutTimeOff;
  dayPart: string;
  first: boolean;
  last: boolean;
  onOpen: () => void;
};

/** One day's part of a booking's bar, which opens the booking. */
export function BookingPart({ timeOff, dayPart, first, last, onOpen }: Props) {
  const label = bookingTooltip({
    typeName: timeOff.timeOffType?.name ?? null,
    startDate: timeOff.startDate,
    endDate: timeOff.endDate,
    cost: timeOff.cost ?? null,
  });
  const style = timeOff.timeOffType
    ? { background: tileStyle(timeOff.timeOffType.colour).background }
    : undefined;
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
        first && "ml-1 rounded-l-full",
        last && "mr-1 rounded-r-full",
      )}
    />
  );
}
