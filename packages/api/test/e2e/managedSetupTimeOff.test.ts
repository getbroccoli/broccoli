import {
  approveReviewedImport,
  expect,
  readTermsPolicies,
  signInAsManagedOwner,
  startManagedEnv,
  test,
} from "#test/support";

import { connectDatabase } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";

test("a managed owner completes setup with time off over GraphQL", async () => {
  const { env, accounts } = await startManagedEnv();
  const browser = await signInAsManagedOwner(env, accounts);
  await browser.graphql(`mutation {
    company { update(input: { name: "Acme Corp" }) { company { id } error { __typename ... on Error { message } } } }
  }`);
  expect(await (await approveReviewedImport(browser)).json()).toMatchObject({
    data: { import: { approve: { error: null } } },
  });
  const database = connectDatabase(env.db.url, createLogger("silent"));
  try {
    const response = await browser.graphql(`mutation {
      setup { complete(input: { timeOff: {
        terms: [{ bankHolidayCalendar: ENGLAND_AND_WALES workingWeek: MONDAY_TO_FRIDAY_7_5_HOURS annualLeavePolicyKey: UK_STATUTORY_MINIMUM }]
        locationTerms: []
      } }) { setup { id step } error { __typename ... on Error { message } } } }
    }`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { setup: { complete: { setup: { id: "instance", step: "DONE" }, error: null } } },
    });
    expect(await readTermsPolicies(database.orm, await env.seed.defaultTermsId())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ typeKey: "annual_leave", entitlementDays: 28 }),
      ]),
    );
  } finally {
    await database.close();
  }
});
