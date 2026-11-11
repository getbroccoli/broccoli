import { useState } from "react";

import { FieldError } from "@/components/form";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { DateChoice, nextLeaveYear, RulesEditor, shortDate } from "@/features/termsDisplay";
import { t } from "@/i18n";

import type { OwnRulesEdit } from "./useOwnRulesEdit";

type Props = {
  edit: OwnRulesEdit;
  hint: string;
};

/** A type row's editor: the rules and from when, or only from when for a return to the terms. */
export function RulesRowEditor({ edit, hint }: Props) {
  return (
    // Disabled while saving, so what is saved is what shows.
    <fieldset
      disabled={edit.saving}
      className="mt-2 flex flex-col gap-3 rounded-lg border border-foreground p-3"
    >
      {edit.mode === "own" ? (
        <>
          <RulesEditor draft={edit.draft} onChange={edit.edit} />
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
      <FieldError id="own-rules-error" message={edit.error ?? undefined} />
    </fieldset>
  );
}

/** From when the own rules apply: the start of this leave year, of the next one, or another date. */
function StartChoice({ edit, hint }: Props) {
  const { draft, earliest } = edit;
  const nextYear = nextLeaveYear(`${earliest.slice(0, 4)}-01-01`);
  const [other, setOther] = useState(false);
  const choice =
    other || (draft.startDate !== earliest && draft.startDate !== nextYear)
      ? "ANOTHER_DATE"
      : draft.startDate === earliest
        ? "THIS_LEAVE_YEAR"
        : "NEXT_LEAVE_YEAR";
  return (
    <DateChoice
      name="rules-start"
      options={[
        { value: "THIS_LEAVE_YEAR", label: shortDate(earliest) },
        { value: "NEXT_LEAVE_YEAR", label: shortDate(nextYear) },
        { value: "ANOTHER_DATE", label: t("terms.edit.otherDate") },
      ]}
      selected={choice}
      onSelect={(value) => {
        setOther(value === "ANOTHER_DATE");
        if (value !== "ANOTHER_DATE") {
          edit.edit({ ...draft, startDate: value === "THIS_LEAVE_YEAR" ? earliest : nextYear });
        }
      }}
      hint={hint}
      picker={
        <DatePicker
          value={draft.startDate}
          fromDate={earliest}
          placeholder={t("terms.edit.pickDate")}
          aria-label={t("terms.edit.pickDate")}
          aria-invalid={Boolean(edit.error)}
          onChange={(startDate) => edit.edit({ ...draft, startDate })}
        />
      }
    />
  );
}
