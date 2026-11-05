import { expect, OWNER, test, TEST_OWNER, testTransactor, timeOffService } from "#test/support";

import { connectDatabase } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";

test("returns an owner's employee time off figures through GraphQL", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const employee = await env.seed.employee({ startDate: "2025-01-01" });
  const database = connectDatabase(env.db.url, createLogger("silent"));
  try {
    const service = timeOffService(database.orm, { today: new Date().toISOString().slice(0, 10) });
    const termsId = await env.seed.defaultTermsId();
    const policy = (await service.listPolicies(OWNER, database.orm)).find(
      ({ key }) => key === "uk_statutory_minimum",
    )!;
    await testTransactor(database.orm)((tx) =>
      service.linkTermsPolicies(OWNER, tx, {
        termsId,
        timeOffPolicyIds: [policy.id],
      }),
    );
  } finally {
    await database.close();
  }

  const response = await browser.graphql(timeOffQuery, { id: employee.id });

  expect(await response.json()).toEqual({
    data: {
      employee: {
        timeOffTypes: [
          {
            timeOffType: { name: "Annual leave" },
            balance: "BALANCE_FROM_ALLOWANCE",
            entitlement: 28,
            bankHolidays: expect.any(Number) as unknown,
            used: 0,
            remaining: expect.any(Number) as unknown,
          },
        ],
      },
    },
  });
});

test("returns null time off for an employee querying a non-report", async ({ env }) => {
  await env.seed.owner();
  const credentials = { email: "employee@example.com", password: TEST_OWNER.password };
  const user = await env.seed.user(credentials);
  await env.seed.employee({ userId: user.id });
  const coworker = await env.seed.employee();
  const { browser } = await env.signIn(credentials);

  const response = await browser.graphql(timeOffQuery, { id: coworker.id });

  expect(await response.json()).toEqual({ data: { employee: { timeOffTypes: null } } });
});

const timeOffQuery = `query EmployeeTimeOff($id: ID!) {
  employee(id: $id) {
    timeOffTypes { timeOffType { name } balance entitlement bankHolidays used remaining }
  }
}`;
