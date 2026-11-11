import { expect, test, setUpEmploymentTerms, readTermsSettings } from "#test/support";

test("an admin can list and open the default terms with their week, time off and setup history", async ({
  env,
}) => {
  const browser = await setUpEmploymentTerms(env);
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
      saturdayMinutes sundayMinutes bankHolidayCalendar
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

test("an admin can stop a policy through GraphQL", async ({ env }) => {
  const browser = await setUpEmploymentTerms(env);
  const termsId = await env.seed.defaultTermsId();
  const before = await readTermsSettings(browser, termsId);
  const year = Number(before.earliestChange.slice(0, 4));
  const family = before.timeOff.find(({ timeOffType }) => timeOffType.typeKey === "FAMILY_LEAVE")!;

  const stopped = await browser.graphql(
    `mutation StopPolicy($input: TimeOffPolicyStopInput!) {
    timeOff { stopPolicy(input: $input) {
      stoppedAssignmentId
      error { __typename }
    } }
  }`,
    { input: { termsId, timeOffTypeId: family.timeOffType.id, stopDate: `${year + 1}-01-01` } },
  );

  expect(await stopped.json()).toEqual({
    data: { timeOff: { stopPolicy: { error: null, stoppedAssignmentId: family.versions[0]!.id } } },
  });
  const after = await readTermsSettings(browser, termsId);
  expect(
    after.timeOff.find(({ timeOffType }) => timeOffType.id === family.timeOffType.id)!.versions,
  ).toEqual([{ ...family.versions[0], endDate: `${year}-12-31` }]);
});

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
