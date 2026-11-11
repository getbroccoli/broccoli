import { useState } from "react";

import { FieldError } from "@/components/form";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  companyToday,
  DateChoice,
  nextLeaveYear,
  shortDate,
  WeekEditor,
} from "@/features/termsDisplay";
import { t } from "@/i18n";

import { startDateError, type OwnWeekEdit } from "./useOwnWeekEdit";

type Props = {
  edit: OwnWeekEdit;
  firstName: string;
};

/** The row's editor: the week and from when, or only from when for a return to the terms. */
export function WeekRowEditor({ edit, firstName }: Props) {
  const hint = t("ownWeek.backHint", { name: firstName });
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
          <StartChoice edit={edit} hint={hint} />
        </>
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
          <p className="text-[13px] text-muted-foreground">{hint}</p>
        </div>
      )}
      <FieldError id="own-week-error" message={edit.error ?? undefined} />
    </fieldset>
  );
}

/** From when the own week applies: today, the next leave year, or another date. */
function StartChoice({ edit, hint }: { edit: OwnWeekEdit; hint: string }) {
  const today = companyToday();
  const { draft, earliest } = edit;
  // From the leave year's start: a person who started this year may not change before their start.
  const nextYear = nextLeaveYear(`${earliest.slice(0, 4)}-01-01`);
  const [other, setOther] = useState(false);
  const error = startDateError(draft, earliest);
  const choice =
    other || (draft.startDate !== today && draft.startDate !== nextYear)
      ? "ANOTHER_DATE"
      : draft.startDate === today
        ? "TODAY"
        : "NEXT_LEAVE_YEAR";
  return (
    <DateChoice
      name="week-start"
      options={[
        { value: "TODAY", label: t("terms.edit.today") },
        { value: "NEXT_LEAVE_YEAR", label: shortDate(nextYear) },
        { value: "ANOTHER_DATE", label: t("terms.edit.otherDate") },
      ]}
      selected={choice}
      onSelect={(value) => {
        setOther(value === "ANOTHER_DATE");
        if (value !== "ANOTHER_DATE") {
          edit.edit({ ...draft, startDate: value === "TODAY" ? today : nextYear });
        }
      }}
      hint={hint}
      error={error ?? undefined}
      picker={
        <DatePicker
          value={draft.startDate}
          fromDate={earliest}
          placeholder={t("terms.edit.pickDate")}
          aria-label={t("terms.edit.pickDate")}
          aria-invalid={Boolean(error)}
          onChange={(startDate) => edit.edit({ ...draft, startDate })}
        />
      }
    />
  );
}
