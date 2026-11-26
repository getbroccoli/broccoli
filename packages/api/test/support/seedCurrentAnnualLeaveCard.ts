import { connectDatabase } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import { todayInLondon } from "../../src/utils";
import type { TestEnv } from "./testEnv";
import { OWNER } from "./testSecurityContext";
import { testTransactor } from "./testTransactor";
import { giveTermsPolicies, timeOffService } from "./timeOffService";

/** A statutory Annual leave card for the year the end-to-end server is serving. */
export async function seedCurrentAnnualLeaveCard(env: TestEnv) {
  const employee = await env.seed.employee({ startDate: "2025-01-01" });
  const database = connectDatabase(env.db.url, createLogger("silent"));
  try {
    const today = todayInLondon();
    await giveTermsPolicies(database.orm, testTransactor(database.orm), {
      termsId: await env.seed.defaultTermsId(),
      policies: [{ key: "uk_statutory_minimum" }],
      today,
    });
    const cards = await timeOffService(database.orm, { today }).readTimeOffTypes(OWNER, {
      employeeIds: [employee.id],
    });
    const card = cards.get(employee.id)![0]!;
    return { employeeId: employee.id, allowanceId: card.allowanceId!, remaining: card.remaining! };
  } finally {
    await database.close();
  }
}
