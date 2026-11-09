import type { EmployeeTermsChangeSkipReason } from "@/__generated__/graphql";
import { shortDate } from "@/features/termsDisplay";
import { t } from "@/i18n";

/**
 * What saving a move does, before it is saved: where the person moves and from when, that their
 * allowance is worked out again from a date that has come, and what of their own they keep.
 */
export function saveLine({
  firstName,
  termsName,
  startDate,
  today,
  keepsOwn,
}: {
  firstName: string;
  termsName: string;
  startDate: string;
  today: string;
  /** What the person has of their own on that date, such as "working week" or "Annual leave". */
  keepsOwn: readonly string[];
}): string {
  return [
    t("changeTerms.saveLine", { name: firstName, terms: termsName, date: shortDate(startDate) }),
    startDate <= today && t("changeTerms.reworked", { name: firstName }),
    keepsOwn.length > 0 && t("changeTerms.keeps", { name: firstName, parts: listOf(keepsOwn) }),
  ]
    .filter(Boolean)
    .join(" ");
}

/** The toast once a move is saved: one still to come, or one that applies already. */
export function savedToast({
  firstName,
  termsName,
  startDate,
  today,
}: {
  firstName: string;
  termsName: string;
  startDate: string;
  today: string;
}): string {
  const values = { name: firstName, terms: termsName, date: shortDate(startDate) };
  return t(startDate > today ? "changeTerms.movesOn" : "changeTerms.isOn", values);
}

/** Why the person cannot move to the terms from that date, for the form. */
export function skipError({
  firstName,
  termsName,
  startDate,
  reason,
}: {
  firstName: string;
  termsName: string;
  startDate: string;
  reason: EmployeeTermsChangeSkipReason;
}): string {
  const values = { name: firstName, terms: termsName, date: shortDate(startDate) };
  return reason === "ALREADY_ON_TERMS"
    ? t("changeTerms.alreadyOn", values)
    : t("changeTerms.leftBefore", values);
}

/** "a", "a and b", "a, b and c". */
function listOf(parts: readonly string[]): string {
  if (parts.length === 1) return parts[0]!;
  return t("changeTerms.and", { list: parts.slice(0, -1).join(", "), last: parts.at(-1)! });
}
