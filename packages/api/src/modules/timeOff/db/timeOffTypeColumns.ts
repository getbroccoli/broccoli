import type { TimeOffType, TimeOffTypeIdentity } from "../domain";
import type { timeOffTypes } from "./timeOffTypesTable";

/** A type as the domain holds it, its default rules gathered from their columns. */
export function toTimeOffType({
  id,
  name,
  typeKey,
  unit,
  icon,
  colour,
  private: isPrivate,
  defaultBalance,
  defaultEntitlementDays,
  defaultBankHolidays,
}: typeof timeOffTypes.$inferSelect): TimeOffType {
  return {
    id,
    name,
    typeKey,
    unit,
    icon,
    colour,
    private: isPrivate,
    defaultRules: {
      balance: defaultBalance,
      entitlementDays: defaultEntitlementDays === null ? null : Number(defaultEntitlementDays),
      bankHolidays: defaultBankHolidays,
    },
  };
}

/** The columns of a type's identity, its default rules spread over their own. */
export function timeOffTypeColumns<Identity extends Partial<TimeOffTypeIdentity>>({
  defaultRules,
  ...identity
}: Identity) {
  return {
    ...identity,
    ...(defaultRules && {
      defaultBalance: defaultRules.balance,
      defaultEntitlementDays:
        defaultRules.entitlementDays === null ? null : String(defaultRules.entitlementDays),
      defaultBankHolidays: defaultRules.bankHolidays,
    }),
  };
}
