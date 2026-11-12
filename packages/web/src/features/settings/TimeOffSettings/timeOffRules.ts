import { rulesInputOf } from "@/features/termsDisplay";

import type { TimeOffTypeValues } from "./TimeOffTypeFields";

/** A type's values as the API takes them, so days typed as 20 or 20.0 are no change. */
export function typeInputOf(values: TimeOffTypeValues) {
  return { ...values, defaultRules: rulesInputOf(values.defaultRules) };
}
