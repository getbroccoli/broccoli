import { CalendarBlank } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";

import { CancelTermsChangeDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { CancelChangeDialog, shortDate } from "@/features/termsDisplay";
import { t } from "@/i18n";

import { forgetHistory } from "../../cache";
import type { TermsPeriod } from "./employmentTermsView";
import { TermsName } from "./TermsName";

type Props = {
  employeeId: string;
  firstName: string;
  period: TermsPeriod & { startDate: string };
  /** The terms the person stays on when the move is cancelled. */
  staysOn: string;
  linksToSettings: boolean;
  /** Admins may cancel it. */
  canCancel: boolean;
};

/** A move to other terms that has not started, "From 1 Dec 2026: Scotland", and its Cancel change. */
export function PlannedMove({
  employeeId,
  firstName,
  period,
  staysOn,
  linksToSettings,
  canCancel,
}: Props) {
  const [asking, setAsking] = useState(false);
  const [cancelChange, { loading }] = usePayloadMutation(CancelTermsChangeDocument, {
    update: forgetHistory,
  });
  const cancel = async () => {
    try {
      await cancelChange({ variables: { input: { employeeId, startDate: period.startDate } } });
      toast(t("people.panel.terms.cancelled"));
    } catch {
      toast.error(t("people.panel.terms.cancelFailed"));
    }
    setAsking(false);
  };
  return (
    <div className="mx-3 mt-2.5 flex items-center gap-2 rounded-lg bg-sidebar px-3 py-1.5 text-sm">
      <CalendarBlank aria-hidden className="shrink-0" />
      <span className="flex-1">
        <span className="font-semibold">
          {t("people.panel.terms.plannedFrom", { date: shortDate(period.startDate) })}
        </span>{" "}
        <TermsName period={period} linksToSettings={linksToSettings} />
      </span>
      {canCancel && (
        <Button variant="ghost" size="sm" onClick={() => setAsking(true)}>
          {t("people.panel.terms.cancelChange")}
        </Button>
      )}
      <CancelChangeDialog
        body={
          asking ? t("people.panel.terms.cancelBody", { name: firstName, terms: staysOn }) : null
        }
        pending={loading}
        onConfirm={() => void cancel()}
        onClose={() => setAsking(false)}
      />
    </div>
  );
}
