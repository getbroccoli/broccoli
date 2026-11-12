import { FieldError } from "@/components/form";
import { companyToday, WeekEditor } from "@/features/termsDisplay";
import { t } from "@/i18n";

import { ReturnDateField } from "./ReturnDateField";
import { StartChoice } from "./StartChoice";
import { startDateError, type OwnWeekEdit } from "./useOwnWeekEdit";

type Props = {
  edit: OwnWeekEdit;
  firstName: string;
};

/** The row's editor: the week and from when, or only from when for a return to the terms. */
export function WeekRowEditor({ edit, firstName }: Props) {
  const hint = t("ownWeek.backHint", { name: firstName });
  const setStart = (startDate: string) => edit.edit({ ...edit.draft, startDate });
  return (
    // Disabled while saving, so what is saved is what shows.
    <fieldset
      disabled={edit.saving}
      className="mt-2 flex flex-col gap-3 rounded-lg border border-foreground p-3"
    >
      {edit.mode === "own" && edit.current ? (
        <>
          <WeekEditor
            draft={edit.draft}
            current={edit.current}
            onChange={(week) => edit.edit({ ...edit.draft, ...week })}
          />
          <StartChoice
            value={edit.draft.startDate}
            earliest={edit.earliest}
            first={{ label: t("terms.edit.today"), date: companyToday() }}
            hint={hint}
            error={startDateError(edit.draft, edit.earliest)}
            onChange={setStart}
          />
        </>
      ) : (
        <ReturnDateField
          value={edit.draft.startDate}
          earliest={edit.earliest}
          hint={hint}
          onChange={setStart}
        />
      )}
      <FieldError id="own-week-error" message={edit.error ?? undefined} />
    </fieldset>
  );
}
