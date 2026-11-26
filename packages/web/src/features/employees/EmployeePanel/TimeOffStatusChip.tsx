import { cn } from "@/lib/class-names";

import { type RequestEnding, statusLabel, type TimeOffStatus } from "./timeOffRequestText";

type Props = { status: TimeOffStatus; ending: RequestEnding };

/** Where time off stands: amber while it waits, green once approved, grey otherwise. */
export function TimeOffStatusChip({ status, ending }: Props) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
        status === "REQUESTED" && "bg-amber-100 text-amber-900",
        status === "APPROVED" && "bg-green-100 text-green-900",
        (status === "REJECTED" || status === "CANCELLED") && "bg-muted text-muted-foreground",
      )}
    >
      {statusLabel(status, ending)}
    </span>
  );
}
