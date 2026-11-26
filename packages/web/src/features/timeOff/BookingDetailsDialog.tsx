import { useState } from "react";
import { toast } from "sonner";

import {
  CancelTimeOffDocument,
  EmployeePanelDocument,
  MyTasksDocument,
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
import { Avatar, decisionLine, TimeOffStatusChip } from "@/features/employees";
import { t } from "@/i18n";
import { calendarDayOf } from "@/lib/calendarDay";
import { formatDays } from "@/lib/formatDays";

import { evictWhosOut } from "./cache";
import { cancelDialogWords } from "./timeOffText";
import { bookingDates, dateRange, dayMonthYear, weekdayDay } from "@/lib/formatDate";
import type { WhosOutPerson, WhosOutTimeOff } from "./WhosOutGrid";

type Props = {
  employeeId: string;
  timeOff: WhosOutTimeOff;
  person: Pick<WhosOutPerson, "firstName" | "lastName" | "avatarUrl">;
  /** The signed-in user's employee: the person withdraws their own request, others cancel it. */
  viewerEmployeeId: string | null;
  onClose: () => void;
};

const PART_LABELS = {
  FULL_DAY: "timeOff.dialog.fullDay",
  MORNING: "timeOff.dialog.morning",
  AFTERNOON: "timeOff.dialog.afternoon",
} as const;

/**
 * One booking or request as the viewer may see it: its type (or "Off"), dates and, for who may
 * read the person's time off, its days, cost, note, status and decision. Whoever may cancel it,
 * or withdraw their own request, does it from here.
 */
export function BookingDetailsDialog({
  employeeId,
  timeOff,
  person,
  viewerEmployeeId,
  onClose,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [cancel, cancelling] = usePayloadMutation(CancelTimeOffDocument, {
    update: (cache) => evictWhosOut(cache, employeeId),
    // An open Book time off may have clashed with this booking; a cancelled request's task ended.
    refetch: [
      WhosOutDocument,
      EmployeePanelDocument,
      TimeOffBookingPreviewDocument,
      ...(timeOff.status === "REQUESTED" ? [MyTasksDocument] : []),
    ],
  });
  const typeName = timeOff.timeOffType?.name ?? t("timeOff.off");
  const cancellable =
    timeOff.canCancel && (timeOff.status === "REQUESTED" || timeOff.status === "APPROVED")
      ? timeOff.status
      : null;
  const byThePerson = viewerEmployeeId === employeeId;
  const cancelWords =
    cancellable &&
    cancelDialogWords(cancellable, byThePerson, {
      name: person.firstName,
      type: typeName,
      dates: dateRange(timeOff.startDate, timeOff.endDate),
    });
  const detailed = timeOff.cost !== null && timeOff.cost !== undefined;
  // A booking is approved straight away with no decision; anything else was asked for.
  const requested = timeOff.status !== "APPROVED" || Boolean(timeOff.decision);

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
    toast(cancelWords!.done);
    onClose();
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="max-h-[92vh] overflow-y-auto sm:max-w-md"
          closeLabel={t("timeOff.details.close")}
        >
          <div className="flex items-center justify-between gap-3 pr-8">
            <DialogTitle className="text-lg">{typeName}</DialogTitle>
            {timeOff.status && (timeOff.status !== "APPROVED" || timeOff.decision) && (
              <TimeOffStatusChip
                status={timeOff.status}
                ending={{ hasDecision: Boolean(timeOff.decision), cancelledBy: null }}
              />
            )}
          </div>
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
          {timeOff.status && timeOff.bookedAt && requested && (
            <p className="text-sm">
              {decisionLine(
                timeOff.status,
                timeOff.decision && {
                  decidedByName:
                    timeOff.decision.decidedBy &&
                    `${timeOff.decision.decidedBy.firstName} ${timeOff.decision.decidedBy.lastName}`,
                  decidedAt: timeOff.decision.decidedAt,
                },
                timeOff.bookedAt,
              )}
            </p>
          )}
          {timeOff.decision?.comment && (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-line">
              {timeOff.decision.comment}
            </p>
          )}
          {timeOff.bookedAt && (
            <p className="text-xs text-muted-foreground">
              {t(requested ? "timeOff.details.requestedOn" : "timeOff.details.bookedOn", {
                // The instant's day in London, where the company's days are.
                date: dayMonthYear(calendarDayOf(new Date(timeOff.bookedAt), "Europe/London")),
              })}
            </p>
          )}
          {cancelWords && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirming(true)}>
                {cancelWords.confirm}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      {cancelWords && (
        <AlertDialog
          open={confirming}
          onOpenChange={(open) => !open && !cancelling.loading && setConfirming(false)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{cancelWords.title}</AlertDialogTitle>
              <AlertDialogDescription>{cancelWords.body}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancelling.loading}>
                {cancelWords.keep}
              </AlertDialogCancel>
              <AlertDialogAction disabled={cancelling.loading} onClick={() => void confirm()}>
                {cancelWords.confirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
