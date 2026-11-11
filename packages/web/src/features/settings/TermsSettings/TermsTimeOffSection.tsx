import { type ReactNode, useState } from "react";

import { EmploymentTermsStackDocument, type TimeOffRulesInput } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { AddTimeOffTypeDialog } from "../TimeOffSettings";
import { StopDialog } from "./StopDialog";
import type { Terms, TimeOffRow } from "./termsQueries";
import { TimeOffRuleRow } from "./TimeOffRuleRow";

type Props = {
  terms: Terms;
  /** The type whose rules are open, with its form and the line under its name. */
  open: { timeOffTypeId: string; editor: ReactNode; summary: string; dirty: boolean } | null;
  onEdit: (timeOffTypeId: string) => void;
  onCancelPlanned: (timeOffTypeId: string, version: TimeOffRow["versions"][number]) => void;
  onCancelStop: (timeOffTypeId: string, version: TimeOffRow["versions"][number]) => void;
  onDiscard: (versionId: string) => void;
  /** Opens the Offer form of a type just added. */
  onAdded: (timeOffType: { id: string; defaultRules: TimeOffRulesInput }) => void;
};

/**
 * Each time off type's rules on the terms today, or "Not offered here", with planned and
 * unpublished rules under them, and adding a type.
 */
export function TermsTimeOffSection({
  terms,
  open,
  onEdit,
  onCancelPlanned,
  onCancelStop,
  onDiscard,
  onAdded,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [stopping, setStopping] = useState<TimeOffRow | null>(null);
  return (
    <section aria-labelledby="terms-time-off" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 id="terms-time-off" className="text-[17px] font-semibold">
          {t("terms.timeOff.title")}
        </h3>
        <p className="text-[13px] text-muted-foreground">{t("terms.timeOff.description")}</p>
      </div>
      <ul className="flex flex-col gap-2.5">
        {terms.timeOff.map((row) => (
          <TimeOffRuleRow
            key={row.timeOffType.id}
            row={row}
            termsName={terms.name}
            open={open?.timeOffTypeId === row.timeOffType.id ? open : null}
            onEdit={() => onEdit(row.timeOffType.id)}
            onStop={() => setStopping(row)}
            onCancelPlanned={(version) => onCancelPlanned(row.timeOffType.id, version)}
            onCancelStop={(version) => onCancelStop(row.timeOffType.id, version)}
            onDiscard={() => row.unpublished && onDiscard(row.unpublished.id)}
          />
        ))}
      </ul>
      <Button variant="outline" size="sm" className="self-start" onClick={() => setAdding(true)}>
        {t("terms.timeOff.add")}
      </Button>
      {stopping && <StopDialog terms={terms} row={stopping} onClose={() => setStopping(null)} />}
      {adding && (
        <AddTimeOffTypeDialog
          refetch={[EmploymentTermsStackDocument]}
          onClose={() => setAdding(false)}
          onAdded={onAdded}
        />
      )}
    </section>
  );
}
