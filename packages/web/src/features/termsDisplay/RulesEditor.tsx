import { t } from "@/i18n";

import type { RulesValues } from "./rulesValues";
import { TimeOffRulesFields } from "./TimeOffRulesFields";

type Props<Values extends RulesValues> = {
  draft: Values;
  onChange: (draft: Values) => void;
};

/** A time off type's rules opened in place: how it counts, the allowance and the leave year. */
export function RulesEditor<Values extends RulesValues>({ draft, onChange }: Props<Values>) {
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
