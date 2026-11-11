import { useState } from "react";
import { toast } from "sonner";

import {
  CancelTimeOffDocument,
  EmployeePanelDocument,
  TimeOffBookingPreviewDocument,
  WhosOutDocument,
} from "@/__generated__/graphql";
import { PayloadFailure, usePayloadMutation } from "@/apollo";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Avatar } from "@/features/employees";
import { t } from "@/i18n";
import { formatDays } from "@/lib/formatDays";

import { evictWhosOut } from "./cache";
import { bookingDates, dateRange, dayMonthYear, weekdayDay } from "./timeOffText";
import type { WhosOutPerson, WhosOutTimeOff } from "./WhosOutGrid";

type Props = {
  employeeId: string;
  timeOff: WhosOutTimeOff;
  person: Pick<WhosOutPerson, "firstName" | "lastName" | "avatarUrl">;
  canCancel: boolean;
  onClose: () => void;
};

const PART_LABELS = {
  FULL_DAY: "timeOff.dialog.fullDay",
  MORNING: "timeOff.dialog.morning",
  AFTERNOON: "timeOff.dialog.afternoon",
} as const;

/**
 * One booking as the viewer may see it: its type (or "Off"), dates and, for who may read the
 * person's time off, its days, cost and note. Admins cancel it from here.
 */
export function BookingDetailsDialog({ employeeId, timeOff, person, canCancel, onClose }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [cancel, cancelling] = usePayloadMutation(CancelTimeOffDocument, {
    update: (cache) => evictWhosOut(cache, employeeId),
    // An open Book time off may have clashed with this booking.
    refetch: [WhosOutDocument, EmployeePanelDocument, TimeOffBookingPreviewDocument],
  });
  const typeName = timeOff.timeOffType?.name ?? t("timeOff.off");
  const detailed = timeOff.cost !== null && timeOff.cost !== undefined;

  const confirm = async () => {
    const cancelled = await cancel({ variables: { input: { timeOffId: timeOff.id } } }).catch(
      (error: unknown) => error,
    );
    if (cancelled instanceof PayloadFailure) {
      // A refusal the API explains, such as a closed leave year; nothing changed.
      toast.error((cancelled.payloadError as { message: string }).message);
      return;
    }
    if (cancelled instanceof Error || !cancelled) {
      toast.error(t("timeOff.cancel.failed"));
      return;
    }
    toast(t("timeOff.cancel.done"));
    onClose();
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="max-h-[92vh] overflow-y-auto sm:max-w-md"
          closeLabel={t("timeOff.details.close")}
        >
          <DialogTitle className="text-lg">{typeName}</DialogTitle>
          <div className="flex items-center gap-2 text-sm">
            <Avatar
              url={person.avatarUrl ?? null}
              firstName={person.firstName}
              lastName={person.lastName}
              className="size-6 text-[9px]"
            />
            {person.firstName} {person.lastName}
          </div>
          <p className="text-sm">
            {bookingDates(timeOff.startDate, timeOff.endDate)}
            {detailed && (
              <span className="text-muted-foreground"> · {formatDays(timeOff.cost!)}</span>
            )}
          </p>
          {detailed && (
            <ul className="overflow-hidden rounded-lg border border-border text-sm">
              {timeOff.days.map(({ date, dayPart }) => (
                <li
                  key={date}
                  className="flex justify-between border-b border-border/60 px-3 py-1.5 last:border-b-0"
                >
                  {weekdayDay(date)}
                  <span className="text-muted-foreground">{t(PART_LABELS[dayPart])}</span>
                </li>
              ))}
            </ul>
          )}
          {timeOff.note && <p className="text-sm whitespace-pre-line">{timeOff.note}</p>}
          {timeOff.bookedAt && (
            <p className="text-xs text-muted-foreground">
              {t("timeOff.details.bookedOn", { date: dayMonthYear(timeOff.bookedAt.slice(0, 10)) })}
            </p>
          )}
          {canCancel && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirming(true)}>
                {t("timeOff.details.cancelBooking")}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => !open && !cancelling.loading && setConfirming(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("timeOff.cancel.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("timeOff.cancel.body", {
                name: person.firstName,
                type: typeName,
                dates: dateRange(timeOff.startDate, timeOff.endDate),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling.loading}>
              {t("timeOff.cancel.keep")}
            </AlertDialogCancel>
            <AlertDialogAction disabled={cancelling.loading} onClick={() => void confirm()}>
              {t("timeOff.cancel.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
