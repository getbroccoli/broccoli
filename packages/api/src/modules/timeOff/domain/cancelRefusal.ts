import type { CalendarDate } from "../../../utils";

/** Why the caller may not cancel this time off now, or null when they may. */
export function cancelRefusal(cancel: {
  /** The person's own rules apply: their own time off, without a delete grant reaching everyone. */
  ownRules: boolean;
  /** The caller's own user booked or requested it. */
  bookedByCaller: boolean;
  status: "requested" | "approved" | "rejected" | "cancelled";
  firstDate: CalendarDate;
  today: CalendarDate;
}): CancelRefusal | null {
  if (cancel.status === "rejected") return "time_off_was_rejected";
  if (cancel.status === "cancelled") return "time_off_is_already_cancelled";
  if (!cancel.ownRules) return null;
  // Someone else's booking for the person, such as a shutdown day, stays theirs to undo.
  if (!cancel.bookedByCaller) return "time_off_was_booked_by_someone_else";
  if (cancel.status === "approved" && cancel.firstDate <= cancel.today) {
    return "time_off_has_started";
  }
  return null;
}

/** Why time off can't be cancelled by this caller now. */
export type CancelRefusal =
  | "time_off_was_rejected"
  | "time_off_is_already_cancelled"
  | "time_off_was_booked_by_someone_else"
  | "time_off_has_started";
