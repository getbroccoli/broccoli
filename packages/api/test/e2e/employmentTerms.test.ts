import { approveReviewedImport, expect, test, TEST_OWNER, type TestEnv } from "#test/support";

test("an admin can list and open the default terms with their week, time off and setup history", async ({
  env,
}) => {
  const browser = await setUpTerms(env);
  const id = await env.seed.defaultTermsId();

  const response = await browser.graphql(
    `query Terms($id: ID!) {
    allTerms { ...Overview }
    terms(id: $id) { ...Overview }
  }
  fragment Overview on Terms {
    id name isDefault
    workingWeek {
      mondayMinutes tuesdayMinutes wednesdayMinutes thursdayMinutes fridayMinutes
      saturdayMinutes sundayMinutes fullDayMinutes bankHolidayCalendar
    }
    timeOff {
      timeOffType { name typeKey }
      versions {
        balance bankHolidays
        leaveYearStart { kind month day }
        yearlyEntitlement { days daysPerWeek }
      }
    }
    history { edges { node { operation cause { kind } changes { field oldValue newValue } } } }
  }`,
    { id },
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    data: { allTerms: [{ id, ...defaultTerms }], terms: { id, ...defaultTerms } },
  });
});

test("an admin can plan Annual leave rules, read them on terms with history, and cancel them", async ({
  env,
}) => {
  const browser = await setUpTerms(env);
  const id = await env.seed.defaultTermsId();
  const nextYearStart = `${new Date().getUTCFullYear() + 1}-01-01`;
  const overview = await browser.graphql(
    `query Terms($id: ID!) {
    terms(id: $id) { timeOff { timeOffType { id typeKey } policy { id } } }
  }`,
    { id },
  );
  const { data } = (await overview.json()) as {
    data: {
      terms: {
        timeOff: { timeOffType: { id: string; typeKey: string }; policy: { id: string } | null }[];
      };
    };
  };
  const annual = data.terms.timeOff.find(
    ({ timeOffType }) => timeOffType.typeKey === "ANNUAL_LEAVE",
  )!;

  const changed = await browser.graphql(
    `mutation ChangePolicy($input: TimeOffPolicyChangeInput!) {
    timeOff { changePolicy(input: $input) { timeOffPolicy { id } error { __typename } } }
  }`,
    {
      input: {
        timeOffPolicyId: annual.policy!.id,
        startDate: nextYearStart,
        rules: {
          balance: "BALANCE_FROM_ALLOWANCE",
          entitlementDays: 22,
          bankHolidays: "BANK_HOLIDAYS_ON_TOP_OF_ALLOWANCE",
        },
      },
    },
  );

  expect(await changed.json()).toEqual({
    data: { timeOff: { changePolicy: { error: null, timeOffPolicy: { id: annual.policy!.id } } } },
  });
  const planned = await browser.graphql(termsPolicyQuery, { id });
  expect(await planned.json()).toMatchObject({
    data: {
      terms: {
        timeOff: expect.arrayContaining([
          {
            timeOffType: { id: annual.timeOffType.id },
            policy: {
              id: annual.policy!.id,
              versions: [
                { startDate: null, yearlyEntitlement: { days: 20 } },
                { startDate: nextYearStart, yearlyEntitlement: { days: 22 } },
              ],
            },
          },
        ]) as unknown,
        history: {
          edges: expect.arrayContaining([
            {
              node: {
                operation: "UPDATED",
                changes: [{ field: `timeOff.${annual.timeOffType.id}` }],
              },
            },
          ]) as unknown,
        },
      },
    },
  });

  const cancelled = await browser.graphql(
    `mutation CancelPolicy($input: TimeOffPolicyCancelChangeInput!) {
    timeOff { cancelPolicyChange(input: $input) { timeOffPolicy { id } error { __typename } } }
  }`,
    { input: { timeOffPolicyId: annual.policy!.id, startDate: nextYearStart } },
  );

  expect(await cancelled.json()).toMatchObject({
    data: {
      timeOff: { cancelPolicyChange: { error: null, timeOffPolicy: { id: annual.policy!.id } } },
    },
  });
  const restored = await browser.graphql(termsPolicyQuery, { id });
  expect(await restored.json()).toMatchObject({
    data: {
      terms: {
        timeOff: expect.arrayContaining([
          {
            timeOffType: { id: annual.timeOffType.id },
            policy: {
              id: annual.policy!.id,
              versions: [{ startDate: null, yearlyEntitlement: { days: 20 } }],
            },
          },
        ]) as unknown,
      },
    },
  });
});

test("an admin can change the terms' working week from today through GraphQL", async ({ env }) => {
  const browser = await setUpTerms(env);
  const id = await env.seed.defaultTermsId();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const week = {
    mondayMinutes: 480,
    tuesdayMinutes: 480,
    wednesdayMinutes: 480,
    thursdayMinutes: 480,
    fridayMinutes: 0,
    saturdayMinutes: 0,
    sundayMinutes: 0,
    fullDayMinutes: 480,
    bankHolidayCalendar: "ENGLAND_AND_WALES",
  };
  const overview = await browser.graphql(
    `query Terms($id: ID!) { terms(id: $id) { workingPattern { id } } }`,
    { id },
  );
  const { data } = (await overview.json()) as {
    data: { terms: { workingPattern: { id: string } } };
  };
  const workingPatternId = data.terms.workingPattern.id;

  const changed = await browser.graphql(
    `mutation ChangeWeek($input: WorkingPatternChangeInput!) {
    employees { changeWorkingPattern(input: $input) { workingPattern { id } error { __typename } } }
  }`,
    {
      input: {
        workingPatternId,
        startDate: today,
        ...week,
      },
    },
  );

  expect(await changed.json()).toEqual({
    data: {
      employees: {
        changeWorkingPattern: { error: null, workingPattern: { id: workingPatternId } },
      },
    },
  });
  const response = await browser.graphql(
    `query Terms($id: ID!) { terms(id: $id) { workingPattern { id versions {
    startDate mondayMinutes tuesdayMinutes wednesdayMinutes thursdayMinutes fridayMinutes saturdayMinutes sundayMinutes fullDayMinutes bankHolidayCalendar
  } } } }`,
    { id },
  );
  expect(await response.json()).toEqual({
    data: {
      terms: {
        workingPattern: {
          id: workingPatternId,
          versions: [
            {
              startDate: today,
              ...week,
            },
          ],
        },
      },
    },
  });
});

async function setUpTerms(env: TestEnv) {
  const browser = await env.startSetupAtImport();
  expect(await (await approveReviewedImport(browser)).json()).toMatchObject({
    data: { imports: { approve: { error: null } } },
  });
  const setup = await browser.post("/api/auth/setup", {
    ...TEST_OWNER,
    timeOff: {
      terms: [
        {
          bankHolidayCalendar: "england_and_wales",
          workingWeek: "monday_to_friday_7_5_hours",
          annualLeavePolicyKey: "uk_20_days_plus_bank_holidays",
        },
      ],
      locationTerms: [],
    },
  });
  expect(setup.status).toBe(200);
  return browser;
}

const termsPolicyQuery = `query Terms($id: ID!) {
  terms(id: $id) {
    timeOff { timeOffType { id } policy { id versions { startDate yearlyEntitlement { days } } } }
    history { edges { node { operation changes { field } } } }
  }
}`;

const defaultTerms = {
  name: "England and Wales",
  isDefault: true,
  workingWeek: [
    {
      mondayMinutes: 450,
      tuesdayMinutes: 450,
      wednesdayMinutes: 450,
      thursdayMinutes: 450,
      fridayMinutes: 450,
      saturdayMinutes: 0,
      sundayMinutes: 0,
      fullDayMinutes: 450,
      bankHolidayCalendar: "ENGLAND_AND_WALES",
    },
  ],
  timeOff: [
    {
      timeOffType: { name: "Annual leave", typeKey: "ANNUAL_LEAVE" },
      versions: [
        {
          balance: "BALANCE_FROM_ALLOWANCE",
          bankHolidays: "BANK_HOLIDAYS_ON_TOP_OF_ALLOWANCE",
          leaveYearStart: { kind: "LEAVE_YEAR_FROM_FIXED_DATE", month: 1, day: 1 },
          yearlyEntitlement: { days: 20, daysPerWeek: 5 },
        },
      ],
    },
    {
      timeOffType: { name: "Sickness", typeKey: "SICKNESS" },
      versions: [
        {
          balance: "NO_BALANCE",
          bankHolidays: null,
          leaveYearStart: null,
          yearlyEntitlement: null,
        },
      ],
    },
    {
      timeOffType: { name: "Family leave", typeKey: "FAMILY_LEAVE" },
      versions: [
        {
          balance: "NO_BALANCE",
          bankHolidays: null,
          leaveYearStart: null,
          yearlyEntitlement: null,
        },
      ],
    },
    {
      timeOffType: { name: "Other", typeKey: "OTHER" },
      versions: [
        {
          balance: "NO_BALANCE",
          bankHolidays: null,
          leaveYearStart: null,
          yearlyEntitlement: null,
        },
      ],
    },
  ],
  history: {
    edges: [
      {
        node: {
          operation: "CREATED",
          cause: { kind: "TIME_OFF_TURNED_ON" },
          changes: [{ field: "name", oldValue: null, newValue: "England and Wales" }],
        },
      },
    ],
  },
};
