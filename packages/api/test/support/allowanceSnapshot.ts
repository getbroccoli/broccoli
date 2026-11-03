import Big from "big.js";
import { asc, eq, inArray } from "drizzle-orm";

import type { Orm } from "../../src/core/db";
import { allowanceLedgerLines, allowances } from "../../src/modules/timeOff/db";

/** Complete stored rows, including IDs and audit fields, for append-only assertions. */
export async function allowanceSnapshot(orm: Orm, employeeId: string) {
  const rows = await orm
    .select()
    .from(allowances)
    .where(eq(allowances.employeeId, employeeId))
    .orderBy(asc(allowances.id));
  if (rows.length === 0) return [];
  const lines = await orm
    .select()
    .from(allowanceLedgerLines)
    .where(
      inArray(
        allowanceLedgerLines.allowanceId,
        rows.map(({ id }) => id),
      ),
    )
    .orderBy(asc(allowanceLedgerLines.id));
  const linesByAllowance = Map.groupBy(lines, ({ allowanceId }) => allowanceId);
  return rows.map((allowance) => ({
    allowance,
    lines: linesByAllowance.get(allowance.id) ?? [],
  }));
}

/** Per-rule and per-bank-holiday sums, excluding identities fully reversed by later lines. */
export function allowanceIdentitySums(
  lines: Awaited<ReturnType<typeof allowanceSnapshot>>[number]["lines"],
) {
  const sums = new Map<string, Big>();
  for (const line of lines) {
    const identity = `${line.kind}:${line.allowanceRuleId ?? ""}:${line.kind === "bank_holiday_taken" ? line.effectiveDate : ""}`;
    sums.set(identity, (sums.get(identity) ?? Big(0)).plus(line.amount));
  }
  return [...sums]
    .filter(([, amount]) => !amount.eq(0))
    .map(([identity, amount]) => [identity, amount.toString()])
    .sort(([a], [b]) => a!.localeCompare(b!));
}
