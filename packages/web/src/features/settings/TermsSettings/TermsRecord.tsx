import { Briefcase, X } from "@phosphor-icons/react";
import { useState } from "react";

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
import {
  CancelChangeDialog,
  companyToday,
  ruleLine,
  splitVersions,
  WeekEditor,
} from "@/features/termsDisplay";
import { t } from "@/i18n";

import { DefaultPill } from "./DefaultPill";
import { DraftPill } from "./DraftPill";
import { PublishDialog } from "./PublishDialog";
import { RulesEditor } from "./RulesEditor";
import { TermsMenu } from "./TermsMenu";
import { TermsTimeOffSection } from "./TermsTimeOffSection";
import { TERMS_DESCRIPTION } from "./termsDescription";
import { changesOnlyDays, ruleTextOf } from "./termsDraft";
import { useDiscardChanges } from "./useDiscardChanges";
import { usePlannedChanges } from "./usePlannedChanges";
import { usePublishTerms } from "./usePublishTerms";
import { useTermsEditing } from "./useTermsEditing";
import { WorkingWeekSection } from "./WorkingWeekSection";

type Props = {
  terms: NonNullable<EmploymentTermsStackQuery["terms"]>;
};

/**
 * One loaded set of terms: header, working week and time off, then their history, as a person's
 * panel reads. One section at a time opens in place and saves unpublished; Publish in the header
 * applies every unpublished change from a date.
 */
export function TermsRecord({ terms }: Props) {
  const editing = useTermsEditing(terms);
  const planned = usePlannedChanges(terms);
  const discarding = useDiscardChanges();
  const [publishing, setPublishing] = useState(false);
  const publish = usePublishTerms(terms, () => setPublishing(true));
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
          <div className="flex flex-wrap items-center gap-x-2">
            <SheetTitle className="max-w-full truncate">{terms.name}</SheetTitle>
            {terms.isDefault && <DefaultPill />}
            {terms.hasUnpublishedChanges && <DraftPill />}
          </div>
          <p className="truncate text-[13px] text-muted-foreground">{meta}</p>
        </div>
        {terms.hasUnpublishedChanges && !open && (
          <Button onClick={publish.start} disabled={publish.publishing}>
            {t("terms.publish.publish")}
          </Button>
        )}
        <TermsMenu terms={terms} />
        <SheetClose render={<Button variant="ghost" size="icon" aria-label={t("terms.close")} />}>
          <X />
        </SheetClose>
      </header>

      <div className="subtle-scrollbar flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        <div className="flex min-w-0 flex-col gap-8 px-6 py-6 md:flex-[2] md:overflow-y-auto">
          {/* Nothing changes while a save is on its way, so it never closes over newer edits. */}
          <fieldset
            disabled={editing.saving || discarding.discarding}
            className="flex min-w-0 flex-col gap-8"
          >
            <WorkingWeekSection
              versions={terms.workingWeek}
              unpublished={terms.unpublishedWorkingWeek}
              editor={
                open?.kind === "week" && (
                  <div className="flex flex-col gap-5 rounded-xl border border-foreground p-4">
                    <WeekEditor
                      draft={open.draft}
                      current={editing.week}
                      onChange={(draft) => editing.change({ kind: "week", draft })}
                    />
                  </div>
                )
              }
              onEdit={editing.editWeek}
              onCancelPlanned={planned.askWeek}
              onDiscard={() =>
                terms.unpublishedWorkingWeek &&
                discarding.discardWeek(terms.unpublishedWorkingWeek.id)
              }
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
              onDiscard={discarding.discardRules}
            />
          </fieldset>
          <RecordHistory recordType="TERMS" recordId={terms.id} description={TERMS_DESCRIPTION} />
        </div>
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
        {open ? (
          <>
            <p className="mr-auto text-[13px] text-muted-foreground">{t("terms.edit.saveLine")}</p>
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
      {/* A new dialog each time it opens, so it starts from the drafts as they are then. */}
      <PublishDialog
        key={String(publishing)}
        terms={terms}
        open={publishing}
        onClose={() => setPublishing(false)}
        publish={publish.publish}
        publishing={publish.publishing}
      />
    </>
  );

  /** The line under an open type's name: "Changed: 20 → 22 days" while only its days change. */
  function openRowSummary(): string {
    const row = editing.row;
    if (open?.kind !== "rules" || !row) return "";
    const current = row.unpublished ?? splitVersions(row.versions, companyToday()).current;
    if (
      editing.dirty &&
      changesOnlyDays(ruleTextOf(open.draft), current) &&
      open.draft.days.trim() !== ""
    ) {
      return t("terms.edit.rules.changedDays", {
        before: String(current!.yearlyEntitlement?.days ?? 0),
        after: open.draft.days,
      });
    }
    return current ? ruleLine(current) : t("terms.timeOff.notOffered", { terms: terms.name });
  }
}
