import { useQuery } from "@apollo/client/react";
import { CaretDown } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { BookingPeopleDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { modeOf } from "@/features/employees";
import { companyToday } from "@/features/termsDisplay";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { BookingSummary } from "./BookingSummary";
import { DatesPane } from "./DatesPane";
import { DayByDayPane } from "./DayByDayPane";
import { Field } from "./Field";
import { PersonLine } from "./PersonLine";
import { TypeMenu } from "./TypeMenu";
import { WhoPicker } from "./WhoPicker";
import { dateRange } from "@/lib/formatDate";

import { dialogWords, headerMode, offeredTypes } from "../timeOffText";
import { useBookingDraft } from "./useBookingDraft";
import { useSaveTimeOff } from "./useSaveTimeOff";

type Props = {
  /** The person and day a day click or the panel opens it with. */
  employeeId?: string;
  date?: string;
  viewerEmployeeId: string | null;
  onClose: () => void;
  /** Opens the booking a refusal clashes with, on its first clashing date. */
  onOpenBooking: (timeOffId: string, date: string) => void;
};

type Pane = "dates" | "days" | null;

/**
 * Books time off for someone, or asks for one's own with approval, as the viewer may for the person
 * picked: who, type, dates and half days, its cost and the balance after.
 */
export function BookTimeOffDialog({
  employeeId,
  date,
  viewerEmployeeId,
  onClose,
  onOpenBooking,
}: Props) {
  const draft = useBookingDraft({ employeeId, date });
  const [pane, setPane] = useState<Pane>(employeeId && !date ? "dates" : date ? "days" : null);
  const people = (
    useQuery(BookingPeopleDocument).data?.employees.edges.map(({ node }) => node) ?? []
  ).filter(({ canCreate }) => canCreate !== "NOT_ALLOWED");
  const person = people.find(({ id }) => id === draft.employeeId);
  const mode =
    (person ? modeOf(person.canCreate) : headerMode(people.map(({ canCreate }) => canCreate))) ??
    "book";
  const type = offeredTypes(draft.types ?? [], mode).find(
    ({ timeOffType }) => timeOffType.id === draft.typeId,
  );
  const firstOffered = offeredTypes(draft.types ?? [], mode)[0]?.timeOffType.id;
  // A request offers only types that need approval: start on the first of them, not on Sickness.
  useEffect(() => {
    if (!type && firstOffered) draft.setTypeId(firstOffered);
  }, [type, firstOffered, draft]);
  const { save, saving } = useSaveTimeOff({ draft, mode, person, viewerEmployeeId, onClose });
  const preview = draft.preview;
  const window = bookingWindow();
  const current = draft.currentPreview;
  const canSave = Boolean(
    person && draft.input && type && current && !current.refusal && current.cost > 0 && !saving,
  );
  const words = dialogWords(mode, canSave ? current!.cost : null);
  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent
        closeLabel={t("timeOff.details.close")}
        className={cn(
          "max-h-[92vh] overflow-y-auto max-sm:flex max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-full max-sm:flex-col max-sm:rounded-none",
          pane ? "sm:max-w-5xl" : "sm:max-w-xl",
        )}
      >
        <DialogTitle className="text-lg">{words.title}</DialogTitle>
        <div className={cn("grid gap-6", pane && "md:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]")}>
          <div className="flex flex-col gap-5">
            <Field label={t("timeOff.dialog.who")}>
              {people.length === 1 && person ? (
                // Someone who may only ask for their own time off has nobody else to pick.
                <PersonLine person={person} />
              ) : (
                <WhoPicker
                  people={people}
                  person={person}
                  onPick={(id) => {
                    draft.pickPerson(id);
                    if (!draft.range) setPane("dates");
                  }}
                />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("timeOff.dialog.type")}>
                <TypeMenu draft={draft} firstName={person?.firstName ?? ""} mode={mode} />
              </Field>
              <Field label={t("timeOff.dialog.dates")}>
                <Button
                  type="button"
                  variant="outline"
                  aria-expanded={pane === "dates"}
                  onClick={() => setPane(pane === "dates" ? null : "dates")}
                  className={cn(
                    "justify-between font-normal",
                    !draft.range && "text-muted-foreground",
                  )}
                >
                  {draft.range
                    ? dateRange(draft.range.from, draft.range.until)
                    : t("timeOff.dialog.pickDates")}
                  <CaretDown aria-hidden className="text-muted-foreground" />
                </Button>
              </Field>
            </div>
            {draft.previewFailed && (
              <p role="alert" className="text-sm text-destructive">
                {t("timeOff.dialog.previewFailed")}
              </p>
            )}
            {person && type && preview && draft.input && !draft.previewFailed && (
              <BookingSummary
                draft={draft}
                firstName={person.firstName}
                mode={mode}
                typeName={type?.timeOffType.name ?? null}
                window={window}
                onToggleDays={() => setPane(pane === "days" ? null : "days")}
                onOpenBooking={onOpenBooking}
              />
            )}
            {person && (
              <Field
                htmlFor="time-off-note"
                label={
                  mode === "book"
                    ? t("timeOff.dialog.note", { name: person.firstName })
                    : t("timeOff.dialog.noteForApprover")
                }
                hint={t("timeOff.dialog.optional")}
              >
                <textarea
                  id="time-off-note"
                  value={draft.note}
                  maxLength={1000}
                  onChange={(event) => draft.setNote(event.target.value)}
                  placeholder={t("timeOff.dialog.notePlaceholder")}
                  rows={2}
                  className="min-h-14 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </Field>
            )}
          </div>
          {pane && (
            <aside className="flex min-h-0 flex-col gap-3 rounded-xl bg-sidebar p-4">
              <header className="flex justify-between text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                {pane === "dates" ? t("timeOff.dialog.pickDates") : t("timeOff.dialog.dayByDay")}
                <button
                  type="button"
                  onClick={() => setPane(null)}
                  className="hover:text-foreground"
                >
                  {t("timeOff.dialog.hide")}
                </button>
              </header>
              {pane === "dates" ? (
                <DatesPane draft={draft} window={window} />
              ) : (
                <DayByDayPane draft={draft} firstName={person?.firstName ?? ""} />
              )}
            </aside>
          )}
        </div>
        <DialogFooter className="items-center max-sm:mt-auto max-sm:shrink-0 max-sm:rounded-none sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {person ? words.footer : t("timeOff.dialog.pickWho")}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              {t("timeOff.dialog.cancel")}
            </Button>
            <Button type="button" disabled={!canSave} onClick={() => void save()}>
              {words.button}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** From the start of this leave year to the end of the next; every standard leave year starts on 1 January. */
function bookingWindow(): { from: string; until: string } {
  // shortcut: assumes leave years from 1 January, as every standard policy has; the API refuses others.
  const year = Number(companyToday().slice(0, 4));
  return { from: `${year}-01-01`, until: `${year + 1}-12-31` };
}
