import {
  approveReviewedImport,
  expect,
  OWNER,
  startManagedEnv,
  signInAsManagedOwner,
  test,
  timeOffService,
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
    const service = timeOffService(database.orm);
    const policy = (await service.listPolicies(OWNER, database.orm)).find(
      ({ key }) => key === "uk_statutory_minimum",
    )!;

    const response = await browser.graphql(
      `mutation Complete($policyId: ID!) {
      setup { complete(input: { timeOff: {
        terms: [{ bankHolidayCalendar: ENGLAND_AND_WALES workingWeek: MONDAY_TO_FRIDAY_7_5_HOURS annualLeavePolicyId: $policyId }]
        locationTerms: []
      } }) { setup { id step } error { __typename ... on Error { message } } } }
    }`,
      { policyId: policy.id },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { setup: { complete: { setup: { id: "instance", step: "DONE" }, error: null } } },
    });
    expect(
      await service.readTermsPolicies(OWNER, { termsId: await env.seed.defaultTermsId() }),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ id: policy.id })]));
  } finally {
    await database.close();
  }
});
