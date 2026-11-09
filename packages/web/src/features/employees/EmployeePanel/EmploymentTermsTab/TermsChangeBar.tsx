import { Button } from "@/components/ui/button";
import { companyToday } from "@/features/termsDisplay";
import { t } from "@/i18n";

import { saveLine } from "../../ChangeTermsForm";
import type { TermsChange } from "./useTermsChange";

type Props = {
  change: TermsChange;
  firstName: string;
};

/** The panel's footer while Change terms is open: what saving does, then Cancel and Save. */
export function TermsChangeBar({ change, firstName }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p aria-live="polite" className="min-w-48 flex-1 text-sm text-muted-foreground">
        {change.ready &&
          saveLine({
            firstName,
            termsName: change.termsName,
            startDate: change.value.startDate,
            today: companyToday(),
            keepsOwn: change.keepsOwn,
          })}
      </p>
      <Button variant="outline" disabled={change.saving} onClick={change.close}>
        {t("changeTerms.cancel")}
      </Button>
      <Button disabled={!change.ready || change.saving} onClick={() => void change.save()}>
        {t("changeTerms.save")}
      </Button>
    </div>
  );
}
