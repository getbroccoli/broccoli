import { expect, giveTermsPolicies, test, TEST_OWNER, testTransactor } from "#test/support";

import { connectDatabase } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";

test("the owner sets own rules, returns to the terms and cancels that return through GraphQL", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();
  const employee = await env.seed.employee({ startDate: "2024-03-01" });
  const types = await browser.graphql(TIME_OFF_TYPES);
  const { data } = (await types.json()) as TimeOffTypesResponse;
  const annual = data.timeOffSettings.timeOffTypes.find(
    ({ timeOffType }) => timeOffType.name === "Annual leave",
  )!.timeOffType;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const year = Number(today.slice(0, 4));
  const input = { employeeId: employee.id, timeOffTypeId: annual.id };
  const returnDate = `${year + 2}-01-01`;

  const own = await browser.graphql(SET_OWN_RULES, {
    input: { ...input, startDate: `${year + 1}-01-01`, rules: twentyFiveDays },
  });

  expect(await own.json()).toEqual({
    data: { timeOff: { setOwnRules: { employee: { id: employee.id }, error: null } } },
  });
  const returned = await browser.graphql(
    `mutation Return($input: TimeOffTermsRulesUseInput!) {
      timeOff { useTermsRules(input: $input) { employee { id } error { __typename } } }
    }`,
    { input: { ...input, startDate: returnDate } },
  );
  expect(await returned.json()).toEqual({
    data: { timeOff: { useTermsRules: { employee: { id: employee.id }, error: null } } },
  });
  const cancelled = await browser.graphql(
    `mutation Cancel($input: TimeOffOwnRulesCancelChangeInput!) {
      timeOff { cancelOwnRulesChange(input: $input) { employee { id } error { __typename } } }
    }`,
    { input: { ...input, startDate: returnDate } },
  );
  expect(await cancelled.json()).toEqual({
    data: { timeOff: { cancelOwnRulesChange: { employee: { id: employee.id }, error: null } } },
  });
});

test("an employee cannot set own rules through GraphQL", async ({ env }) => {
  const owner = await env.signInAsOwner();
  const types = await owner.browser.graphql(TIME_OFF_TYPES);
  const { data } = (await types.json()) as TimeOffTypesResponse;
  const annual = data.timeOffSettings.timeOffTypes.find(
    ({ timeOffType }) => timeOffType.name === "Annual leave",
  )!.timeOffType;
  const credentials = { email: "sam@example.com", password: TEST_OWNER.password };
  const user = await env.seed.user(credentials);
  const employee = await env.seed.employee({ userId: user.id, startDate: "2024-03-01" });
  const { browser } = await env.signIn(credentials);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

  const response = await browser.graphql(SET_OWN_RULES, {
    input: {
      employeeId: employee.id,
      timeOffTypeId: annual.id,
      startDate: `${Number(today.slice(0, 4)) + 1}-01-01`,
      rules: twentyFiveDays,
    },
  });

  expect(await response.json()).toMatchObject({ errors: [{ extensions: { code: "FORBIDDEN" } }] });
});

test("reads a person's time off rules from a past date through GraphQL", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const employee = await env.seed.employee({ startDate: "2024-03-01" });
  const database = connectDatabase(env.db.url, createLogger("silent"));
  try {
    await giveTermsPolicies(database.orm, testTransactor(database.orm), {
      termsId: await env.seed.defaultTermsId(),
      policies: [{ key: "uk_20_days_plus_bank_holidays" }],
      today: "2026-11-09",
    });
  } finally {
    await database.close();
  }

  const response = await browser.graphql(
    `query($id: ID!, $from: Date!) {
      employee(id: $id) { employmentTerms { timeOff(from: $from) {
        timeOffType { name }
        versions { startDate source rules { balance } }
      } } }
    }`,
    { id: employee.id, from: "2026-01-01" },
  );

  expect(await response.json()).toMatchObject({
    data: {
      employee: {
        employmentTerms: {
          timeOff: expect.arrayContaining([
            {
              timeOffType: { name: "Annual leave" },
              versions: [
                {
                  startDate: "2026-01-01",
                  source: "FROM_THEIR_TERMS",
                  rules: { balance: "BALANCE_FROM_ALLOWANCE" },
                },
              ],
            },
          ]) as unknown,
        },
      },
    },
  });
});

const TIME_OFF_TYPES = `query { timeOffSettings { timeOffTypes { timeOffType { id name } } } }`;
const SET_OWN_RULES = `mutation Set($input: TimeOffOwnRulesSetInput!) {
  timeOff { setOwnRules(input: $input) { employee { id } error { __typename } } }
}`;
const twentyFiveDays = {
  balance: "BALANCE_FROM_ALLOWANCE",
  entitlementDays: 25,
  bankHolidays: "BANK_HOLIDAYS_ON_TOP_OF_ALLOWANCE",
};

type TimeOffTypesResponse = {
  data: { timeOffSettings: { timeOffTypes: { timeOffType: { id: string; name: string } }[] } };
};
