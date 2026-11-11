import { t } from "@/i18n";

import { TimeOffRulesFields } from "../TimeOffSettings";
import type { RulesDraft } from "./termsDraft";

type Props = {
  draft: RulesDraft;
  onChange: (draft: RulesDraft) => void;
};

/** A time off type's rules opened in place: how it counts, the allowance and the leave year. */
export function RulesEditor({ draft, onChange }: Props) {
  return (
    <div className="flex flex-col gap-5">
      <TimeOffRulesFields values={draft} onChange={onChange} />

      {draft.balance !== "NO_BALANCE" && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold">{t("terms.edit.rules.leaveYear")}</span>
          <span className="text-sm">{t("terms.edit.rules.leaveYearValue")}</span>
        </div>
      )}
    </div>
  );
}
