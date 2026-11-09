import { shortDate } from "@/features/termsDisplay";
import { t } from "@/i18n";

/**
 * A change to a person's terms as the words after its author: "changed terms to Scotland from
 * 1 Dec 2026", or "cancelled the change of terms to …" for a cancelled move; null for other fields.
 */
export function employeeChangeSentence({
  field,
  oldValue,
  newValue,
  oldLabel,
  newLabel,
}: {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  oldLabel?: string | null;
  newLabel?: string | null;
}): string | null {
  if (field !== "terms") return null;
  const move = parseMove(newValue);
  if (move) {
    return t("people.panel.terms.history.changed", {
      terms: newLabel ?? "",
      date: shortDate(move.startDate),
    });
  }
  const cancelled = parseMove(oldValue);
  return (
    cancelled &&
    t("people.panel.terms.history.cancelled", {
      terms: oldLabel ?? "",
      date: shortDate(cancelled.startDate),
    })
  );
}

/** A terms change's stored value: the terms and the date it applies from. */
function parseMove(value: string | null): { termsId: string; startDate: string } | null {
  return value === null ? null : (JSON.parse(value) as { termsId: string; startDate: string });
}
