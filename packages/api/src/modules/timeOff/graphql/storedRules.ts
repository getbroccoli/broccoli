import type { ResolversTypes } from "../../../core/graphql";

/** Rules as GraphQL sends them, with the lower-case enum values the use cases take. */
export function toStoredRules({
  balance,
  entitlementDays,
  bankHolidays,
}: ResolversTypes["TimeOffRulesInput"]) {
  return {
    balance: balance.toLowerCase(),
    entitlementDays,
    bankHolidays: bankHolidays?.toLowerCase(),
  };
}
