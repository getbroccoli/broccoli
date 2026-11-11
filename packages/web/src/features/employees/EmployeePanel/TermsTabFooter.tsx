import { companyToday } from "@/features/termsDisplay";

import { saveLine } from "../ChangeTermsForm";
import { EditFooter, type OwnWeekEdit, type TermsChange } from "./EmploymentTermsTab";

type Props = {
  termsChange: TermsChange;
  weekEdit: OwnWeekEdit;
  firstName: string;
};

/** The panel's footer while an edit on the Employment terms tab is open; nothing otherwise. */
export function TermsTabFooter({ termsChange, weekEdit, firstName }: Props) {
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
  if (!weekEdit.mode) return null;
  return (
    <div className="border-t border-border px-4 py-3">
      <EditFooter
        line={weekEdit.line}
        ready={weekEdit.line !== null}
        saving={weekEdit.saving}
        onCancel={weekEdit.close}
        onSave={() => void weekEdit.save()}
      />
    </div>
  );
}
