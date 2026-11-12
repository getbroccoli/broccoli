import { toEnum } from "../../../core/graphql";
import { DEFAULT_TIME_OFF_TYPE_LOOK, type TimeOffType } from "../domain";

/** Balance kinds as GraphQL names them. */
export const BALANCE_KINDS = {
  balance_from_allowance: "BALANCE_FROM_ALLOWANCE",
  unlimited_balance: "UNLIMITED_BALANCE",
  no_balance: "NO_BALANCE",
} as const;

/** A time off type with its icon and colour as GraphQL values, the defaults filling in for none. */
export function toGraphqlType(type: TimeOffType) {
  return {
    id: type.id,
    name: type.name,
    icon: toEnum(type.icon ?? DEFAULT_TIME_OFF_TYPE_LOOK.icon),
    colour: toEnum(type.colour ?? DEFAULT_TIME_OFF_TYPE_LOOK.colour),
    typeKey: type.typeKey && toEnum(type.typeKey),
    private: type.private,
    defaultRules: {
      balance: BALANCE_KINDS[type.defaultRules.balance],
      entitlementDays: type.defaultRules.entitlementDays,
      bankHolidays: type.defaultRules.bankHolidays && toEnum(type.defaultRules.bankHolidays),
    },
  };
}
