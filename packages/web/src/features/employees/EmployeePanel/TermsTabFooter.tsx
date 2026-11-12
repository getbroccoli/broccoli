import { companyToday } from "@/features/termsDisplay";

import { saveLine } from "../ChangeTermsForm";
import {
  EditFooter,
  type OwnRulesEdit,
  type OwnWeekEdit,
  type TermsChange,
} from "./EmploymentTermsTab";

type Props = {
  termsChange: TermsChange;
  weekEdit: OwnWeekEdit;
  rulesEdit: OwnRulesEdit;
  firstName: string;
};

/** The panel's footer while an edit on the Employment terms tab is open; nothing otherwise. */
export function TermsTabFooter({ termsChange, weekEdit, rulesEdit, firstName }: Props) {
  if (termsChange.open) {
    return (
      <div className="border-t border-border px-4 py-3">
        <EditFooter
          line={
            termsChange.ready
              ? saveLine({
                  firstName,
                  termsName: termsChange.termsName,
                  startDate: termsChange.value.startDate,
                  today: companyToday(),
                  keepsOwn: termsChange.keepsOwn,
                })
              : null
          }
          ready={termsChange.ready}
          saving={termsChange.saving}
          onCancel={termsChange.close}
          onSave={() => void termsChange.save()}
        />
      </div>
    );
  }
  const edit = weekEdit.mode ? weekEdit : rulesEdit.mode ? rulesEdit : null;
  if (!edit) return null;
  return (
    <div className="border-t border-border px-4 py-3">
      <EditFooter
        line={edit.line}
        ready={edit.line !== null}
        saving={edit.saving}
        onCancel={edit.close}
        onSave={() => void edit.save()}
      />
    </div>
  );
}
