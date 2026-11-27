import { useState } from "react";
import { toast } from "sonner";

import {
  CancelTimeOffDocument,
  EmployeePanelDocument,
  MyTasksDocument,
  TimeOffBookingPreviewDocument,
  WhosOutDocument,
} from "@/__generated__/graphql";
import { PayloadFailure, useCache, usePayloadMutation } from "@/apollo";
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
import { TaskDecision } from "@/features/tasks";
import { t } from "@/i18n";
import { calendarDayOf } from "@/lib/calendarDay";
import { cn } from "@/lib/class-names";

import { evictWhosOut } from "./cache";
import { bookingTotal, cancelDialogWords, dayCostLine } from "./timeOffText";
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

/**
 * One booking or request as the viewer may see it: its type (or "Off"), dates and, for who may
 * read the person's time off, its days, cost, note, status and decision. Its approver decides it
 * from here; anyone else who may cancel it, or withdraw their own request, does that.
 */
export function BookingDetailsDialog({
  employeeId,
  timeOff,
  person,
  viewerEmployeeId,
  onClose,
}: Props) {
  const cache = useCache();
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
  const decisionTask = timeOff.myOpenTasks.find(hasResultForm) ?? null;
  // The approver decides rather than cancels.
  const cancellable =
    !decisionTask &&
    timeOff.canCancel &&
    (timeOff.status === "REQUESTED" || timeOff.status === "APPROVED")
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
              <span className="text-muted-foreground">
                {" · "}
                {bookingTotal({
                  cost: timeOff.cost!,
                  deductedDays: timeOff.deductedDays ?? null,
                  typeName,
                })}
              </span>
            )}
          </p>
          {timeOff.dayCosts && (
            <ul className="overflow-hidden rounded-lg border border-border text-sm">
              {timeOff.dayCosts.map((day) => (
                <li
                  key={day.date}
                  className={cn(
                    "flex justify-between gap-3 border-b border-border/60 px-3 py-1.5 last:border-b-0",
                    day.reason !== "WORKING_DAY" && "text-muted-foreground",
                  )}
                >
                  {weekdayDay(day.date)}
                  <span className="text-right text-muted-foreground">
                    {dayCostLine({ ...day, dayPart: dayPartOn(timeOff, day.date) })}
                  </span>
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
          {decisionTask && (
            <DialogFooter className="sm:justify-start">
              <TaskDecision
                task={decisionTask}
                refetch={DECIDED_REFETCH}
                // Also after a refusal: someone decided or withdrew it first, so the month reloads.
                onSettled={() => {
                  evictWhosOut(cache, employeeId);
                  onClose();
                }}
              />
            </DialogFooter>
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

/** The part of the day booked on a date: full day, morning or afternoon. */
function dayPartOn(timeOff: WhosOutTimeOff, date: string) {
  return timeOff.days.find((day) => day.date === date)!.dayPart;
}

/** What a decision changes: the month, the person's figures, an open booking's clashes, Tasks. */
const DECIDED_REFETCH = [
  WhosOutDocument,
  EmployeePanelDocument,
  TimeOffBookingPreviewDocument,
  MyTasksDocument,
];

type OpenTask = WhosOutTimeOff["myOpenTasks"][number];

function hasResultForm(
  task: OpenTask,
): task is OpenTask & { resultForm: NonNullable<OpenTask["resultForm"]> } {
  return task.resultForm !== null && task.resultForm !== undefined;
}
