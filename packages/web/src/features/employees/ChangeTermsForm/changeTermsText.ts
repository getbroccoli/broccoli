import type { EmployeeTermsChangeSkipReason } from "@/__generated__/graphql";
import { shortDate } from "@/features/termsDisplay";
import { t } from "@/i18n";

/**
 * What saving a move does, before it is saved: where the person moves (null terms: off their terms)
 * and from when, that their allowance is worked out again from a date that has come, and what of
 * their own they keep.
 */
export function saveLine({
  firstName,
  termsName,
  startDate,
  today,
  keepsOwn,
}: {
  firstName: string;
  termsName: string | null;
  startDate: string;
  today: string;
  /** What the person has of their own on that date, such as "working week" or "Annual leave". */
  keepsOwn: readonly string[];
}): string {
  const values = { name: firstName, terms: termsName ?? "", date: shortDate(startDate) };
  return [
    t(termsName === null ? "changeTerms.saveLineNoTerms" : "changeTerms.saveLine", values),
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
  /** Null: no terms. */
  termsName: string | null;
  startDate: string;
  today: string;
}): string {
  const values = { name: firstName, terms: termsName ?? "", date: shortDate(startDate) };
  if (termsName === null) return t("changeTerms.noTermsFrom", values);
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
  termsName: string | null;
  startDate: string;
  reason: EmployeeTermsChangeSkipReason;
}): string {
  const values = { name: firstName, terms: termsName ?? "", date: shortDate(startDate) };
  if (reason === "ALREADY_ON_TERMS") return t("changeTerms.alreadyOn", values);
  if (reason === "ALREADY_ON_NO_TERMS") return t("changeTerms.alreadyNoTerms", values);
  return t("changeTerms.leftBefore", values);
}

/** "a", "a and b", "a, b and c". */
function listOf(parts: readonly string[]): string {
  if (parts.length === 1) return parts[0]!;
  return t("changeTerms.and", { list: parts.slice(0, -1).join(", "), last: parts.at(-1)! });
}
