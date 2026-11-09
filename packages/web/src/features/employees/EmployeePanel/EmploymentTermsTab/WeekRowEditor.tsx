import { FieldError } from "@/components/form";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { WeekEditor } from "@/features/termsDisplay";
import { t } from "@/i18n";

import type { OwnWeekEdit } from "./useOwnWeekEdit";

type Props = {
  edit: OwnWeekEdit;
  firstName: string;
};

/** The row's editor: the week and from when, or only from when for a return to the terms. */
export function WeekRowEditor({ edit, firstName }: Props) {
  return (
    // Disabled while saving, so what is saved is what shows.
    <fieldset
      disabled={edit.saving}
      className="mt-2 flex flex-col gap-3 rounded-lg border border-foreground p-3"
    >
      {edit.mode === "own" && edit.current ? (
        <WeekEditor
          draft={edit.draft}
          current={edit.current}
          earliest={edit.earliest}
          dated
          onChange={edit.edit}
        />
      ) : (
        <div className="flex max-w-64 flex-col gap-1.5">
          <Label>{t("changeTerms.appliesFrom")}</Label>
          <DatePicker
            value={edit.draft.startDate}
            fromDate={edit.earliest}
            placeholder={t("changeTerms.appliesFrom")}
            aria-label={t("changeTerms.appliesFrom")}
            // A return needs a date: picking the chosen day again keeps it.
            onChange={(startDate) => startDate && edit.edit({ ...edit.draft, startDate })}
          />
          <p className="text-[13px] text-muted-foreground">
            {t("ownWeek.backHint", { name: firstName })}
          </p>
        </div>
      )}
      <FieldError id="own-week-error" message={edit.error ?? undefined} />
    </fieldset>
  );
}
