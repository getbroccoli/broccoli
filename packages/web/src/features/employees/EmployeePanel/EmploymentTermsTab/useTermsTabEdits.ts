import { type OwnRulesEdit, useOwnRulesEdit } from "./useOwnRulesEdit";
import { type OwnWeekEdit, useOwnWeekEdit } from "./useOwnWeekEdit";
import { type TermsChange, useTermsChange } from "./useTermsChange";

/** The edits on a person's Employment terms tab, of which only one is open at a time. */
export interface TermsTabEdits {
  termsChange: TermsChange;
  weekEdit: OwnWeekEdit;
  rulesEdit: OwnRulesEdit;
  /** How many hold changes, so leaving asks first. */
  changedCount: number;
  /** One is open, so the panel's footer is theirs. */
  open: boolean;
  close: () => void;
}

/** The person's Employment terms tab edits: Change terms, their own week and own rules. */
export function useTermsTabEdits(person: { employeeId: string; firstName: string }): TermsTabEdits {
  const termsChange = useTermsChange(person);
  const weekEdit = useOwnWeekEdit(person);
  const rulesEdit = useOwnRulesEdit(person);
  return {
    termsChange,
    weekEdit,
    rulesEdit,
    changedCount: [termsChange.changed, weekEdit.changed, rulesEdit.changed].filter(Boolean).length,
    open: termsChange.open || weekEdit.mode !== null || rulesEdit.mode !== null,
    close: () => {
      termsChange.close();
      weekEdit.close();
      rulesEdit.close();
    },
  };
}
