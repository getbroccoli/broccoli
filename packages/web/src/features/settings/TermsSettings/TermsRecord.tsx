import { Briefcase, X } from "@phosphor-icons/react";

import type { EmploymentTermsStackQuery } from "@/__generated__/graphql";
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
import { SheetClose, SheetTitle } from "@/components/ui/sheet";
import { RecordHistory } from "@/features/records";
import { t } from "@/i18n";

import { CancelChangeDialog } from "./CancelChangeDialog";
import { DefaultPill } from "./DefaultPill";
import { RulesEditor } from "./RulesEditor";
import { TermsTimeOffSection } from "./TermsTimeOffSection";
import { TERMS_DESCRIPTION } from "./termsDescription";
import { changesOnlyDays } from "./termsDraft";
import { ruleLine } from "./termsText";
import { usePlannedChanges } from "./usePlannedChanges";
import { useTermsEditing } from "./useTermsEditing";
import { WeekEditor } from "./WeekEditor";
import { WhatChanges } from "./WhatChanges";
import { WorkingWeekSection } from "./WorkingWeekSection";

type Props = {
  terms: NonNullable<EmploymentTermsStackQuery["terms"]>;
};

/**
 * One loaded set of terms: header, working week and time off, then their history, as a person's
 * panel reads. One section at a time opens in place, with what saving changes beside it; the
 * footer saves it.
 */
export function TermsRecord({ terms }: Props) {
  const editing = useTermsEditing(terms);
  const planned = usePlannedChanges(terms);
  const { open } = editing;
  const meta = t(terms.peopleCount === 1 ? "terms.peopleOne" : "terms.people", {
    count: String(terms.peopleCount),
  });

  return (
    <>
      <header className="flex items-center gap-4 border-b border-border px-6 py-5">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
        >
          <Briefcase size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <SheetTitle className="truncate">{terms.name}</SheetTitle>
            {terms.isDefault && <DefaultPill />}
          </div>
          <p className="truncate text-[13px] text-muted-foreground">{meta}</p>
        </div>
        <SheetClose render={<Button variant="ghost" size="icon" aria-label={t("terms.close")} />}>
          <X />
        </SheetClose>
      </header>

      <div className="subtle-scrollbar flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        <div className="flex min-w-0 flex-col gap-8 px-6 py-6 md:flex-[2] md:overflow-y-auto">
          {/* Nothing changes while a save is on its way, so it never closes over newer edits. */}
          <fieldset disabled={editing.saving} className="flex min-w-0 flex-col gap-8">
            <WorkingWeekSection
              versions={terms.workingWeek}
              editor={
                open?.kind === "week" &&
                editing.week && (
                  <div className="flex flex-col gap-5 rounded-xl border border-foreground p-4">
                    <WeekEditor
                      draft={open.draft}
                      current={editing.week}
                      earliest={editing.earliest}
                      onChange={(draft) => editing.change({ kind: "week", draft })}
                    />
                  </div>
                )
              }
              onEdit={editing.editWeek}
              onCancelPlanned={planned.askWeek}
            />
            <TermsTimeOffSection
              termsName={terms.name}
              timeOff={terms.timeOff}
              open={
                open?.kind === "rules"
                  ? {
                      timeOffTypeId: open.timeOffTypeId,
                      dirty: editing.dirty,
                      summary: openRowSummary(),
                      editor: (
                        <RulesEditor
                          draft={open.draft}
                          versions={editing.row!.versions}
                          earliest={editing.earliest}
                          onChange={(draft) =>
                            editing.change({
                              kind: "rules",
                              timeOffTypeId: open.timeOffTypeId,
                              draft,
                            })
                          }
                        />
                      ),
                    }
                  : null
              }
              onEdit={editing.editRules}
              onCancelPlanned={planned.askRules}
            />
          </fieldset>
          <RecordHistory recordType="TERMS" recordId={terms.id} description={TERMS_DESCRIPTION} />
        </div>
        {open && (
          <aside className="border-t border-border bg-muted/40 px-6 py-6 md:flex-1 md:overflow-y-auto md:border-t-0 md:border-l">
            <WhatChanges box={editing.box} people={editing.people} termsName={terms.name} />
          </aside>
        )}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
        {open ? (
          <>
            <p className="mr-auto text-[13px] text-muted-foreground">{editing.saveLine}</p>
            <Button variant="outline" onClick={editing.close} disabled={editing.saving}>
              {t("terms.edit.cancel")}
            </Button>
            <Button
              onClick={() => void editing.save()}
              disabled={!editing.canSave || editing.saving}
            >
              {t("terms.edit.save")}
            </Button>
          </>
        ) : (
          <SheetClose render={<Button variant="outline" />}>{t("terms.close")}</SheetClose>
        )}
      </footer>

      <AlertDialog
        open={editing.waiting !== null}
        onOpenChange={(isOpen) => !isOpen && editing.keepEditing()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("terms.edit.discardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("terms.edit.discardDetail")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("terms.edit.keepEditing")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={editing.discard}>
              {t("terms.edit.discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CancelChangeDialog
        body={planned.body}
        pending={planned.pending}
        onConfirm={planned.confirm}
        onClose={planned.close}
      />
    </>
  );

  /** The line under an open type's name: "Changed: 20 → 22 days" while only its days change. */
  function openRowSummary(): string {
    const current = editing.rowBase;
    if (open?.kind !== "rules") return "";
    if (editing.dirty && changesOnlyDays(open.draft, current) && open.draft.days.trim() !== "") {
      return t("terms.edit.rules.changedDays", {
        before: String(current!.yearlyEntitlement?.days ?? 0),
        after: open.draft.days,
      });
    }
    return current ? ruleLine(current) : t("terms.timeOff.notOffered", { terms: terms.name });
  }
}
