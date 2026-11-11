import { FieldError } from "@/components/form";
import { RulesEditor, shortDate } from "@/features/termsDisplay";

import { ReturnDateField } from "./ReturnDateField";
import { StartChoice } from "./StartChoice";
import type { OwnRulesEdit } from "./useOwnRulesEdit";

type Props = {
  edit: OwnRulesEdit;
  hint: string;
};

/** A type row's editor: the rules and from when, or only from when for a return to the terms. */
export function RulesRowEditor({ edit, hint }: Props) {
  const setStart = (startDate: string) => edit.edit({ ...edit.draft, startDate });
  return (
    // Disabled while saving, so what is saved is what shows.
    <fieldset
      disabled={edit.saving}
      className="mt-2 flex flex-col gap-3 rounded-lg border border-foreground p-3"
    >
      {edit.mode === "own" ? (
        <>
          <RulesEditor draft={edit.draft} onChange={edit.edit} />
          <StartChoice
            value={edit.draft.startDate}
            earliest={edit.earliest}
            first={{ label: shortDate(edit.earliest), date: edit.earliest }}
            hint={hint}
            error={null}
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
      <FieldError id="own-rules-error" message={edit.error ?? undefined} />
    </fieldset>
  );
}
