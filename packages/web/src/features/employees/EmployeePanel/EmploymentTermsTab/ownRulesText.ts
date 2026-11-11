import { shortDate } from "@/features/termsDisplay";
import { t } from "@/i18n";

/** What saving own rules does: offers the type, gives or changes them, and the allowance follows. */
export function ownRulesSaveLine({
  firstName,
  typeName,
  startDate,
  today,
  alreadyOwn,
  offer,
}: {
  firstName: string;
  typeName: string;
  startDate: string;
  today: string;
  /** They have their own rules for the type on that date already. */
  alreadyOwn: boolean;
  /** Neither their terms nor they have rules for the type on that date. */
  offer: boolean;
}): string {
  const values = { name: firstName, type: typeName, date: shortDate(startDate) };
  const key = alreadyOwn
    ? "ownRules.saveChanges"
    : offer
      ? "ownRules.saveOffers"
      : "ownRules.saveGives";
  return withAllowance(t(key, values), firstName, startDate, today);
}

/** What saving a return to the terms' rules does, or taking the type away where they don't offer it. */
export function termsRulesSaveLine({
  firstName,
  typeName,
  termsName,
  termsOffer,
  startDate,
  today,
}: {
  firstName: string;
  typeName: string;
  termsName: string;
  /** The terms offer the type on that date. */
  termsOffer: boolean;
  startDate: string;
  today: string;
}): string {
  const values = { name: firstName, type: typeName, terms: termsName, date: shortDate(startDate) };
  const line = t(termsOffer ? "ownRules.saveBack" : "ownRules.saveTakesAway", values);
  return withAllowance(line, firstName, startDate, today);
}

/** "Sam’s own Annual leave saved." */
export function ownRulesSavedToast(firstName: string, typeName: string): string {
  return t("ownRules.saved", { name: firstName, type: typeName });
}

/** "Sam is back on England and Wales’s Annual leave from 1 Jan 2027." */
export function termsRulesSavedToast({
  firstName,
  typeName,
  termsName,
  startDate,
}: {
  firstName: string;
  typeName: string;
  termsName: string;
  startDate: string;
}): string {
  return t("ownRules.back", {
    name: firstName,
    type: typeName,
    terms: termsName,
    date: shortDate(startDate),
  });
}

function withAllowance(line: string, firstName: string, startDate: string, today: string): string {
  return startDate <= today ? `${line} ${t("changeTerms.reworked", { name: firstName })}` : line;
}
