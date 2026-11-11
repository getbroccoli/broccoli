import { expect } from "vitest";

import { approveReviewedImport } from "./approveReviewedImport";
import type { Browser } from "./browser";
import { TEST_OWNER, type TestEnv } from "./testEnv";

export async function setUpEmploymentTerms(env: TestEnv) {
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

export async function readTermsSettings(browser: Browser, id: string) {
  const response = await browser.graphql(
    `query($id: ID!) {
    terms(id: $id) {
      earliestChange hasUnpublishedChanges
      workingWeek { id startDate endDate mondayMinutes fridayMinutes bankHolidayCalendar }
      unpublishedWorkingWeek { id revision }
      timeOff { timeOffType { id typeKey } versions { id startDate endDate yearlyEntitlement { days } } unpublished { id revision } }
    }
  }`,
    { id },
  );
  const body = (await response.json()) as {
    data: {
      terms: {
        earliestChange: string;
        hasUnpublishedChanges: boolean;
        workingWeek: {
          id: string;
          startDate: string;
          endDate: string | null;
          mondayMinutes: number;
          fridayMinutes: number;
          bankHolidayCalendar: string;
        }[];
        unpublishedWorkingWeek: { id: string; revision: number } | null;
        timeOff: {
          timeOffType: { id: string; typeKey: string };
          versions: {
            id: string;
            startDate: string;
            endDate: string | null;
            yearlyEntitlement: { days: number } | null;
          }[];
          unpublished: { id: string; revision: number } | null;
        }[];
      };
    };
  };
  expect(body).toHaveProperty("data.terms");
  return body.data.terms;
}

export async function saveTermsWeek(browser: Browser, termsId: string, mondayMinutes = 480) {
  const response = await browser.graphql(
    `mutation($id: ID!, $mondayMinutes: Int!) {
    employees { saveWorkingPattern(input: {
      termsId: $id, mondayMinutes: $mondayMinutes, tuesdayMinutes: 480, wednesdayMinutes: 480,
      thursdayMinutes: 480, fridayMinutes: 0, saturdayMinutes: 0, sundayMinutes: 0,
      bankHolidayCalendar: ENGLAND_AND_WALES
    }) { workingWeek { id revision } error { __typename } } }
  }`,
    { id: termsId, mondayMinutes },
  );
  const body = (await response.json()) as {
    data: {
      employees: {
        saveWorkingPattern: { workingWeek: { id: string; revision: number }; error: unknown };
      };
    };
  };
  expect(body.data.employees.saveWorkingPattern.error).toBeNull();
  return body.data.employees.saveWorkingPattern.workingWeek;
}

export async function saveTermsRules(browser: Browser, termsId: string, timeOffTypeId: string) {
  const response = await browser.graphql(
    `mutation($id: ID!, $type: ID!) {
    timeOff { saveTimeOffPolicy(input: {
      termsId: $id, timeOffTypeId: $type,
      rules: { balance: BALANCE_FROM_ALLOWANCE, entitlementDays: 22, bankHolidays: BANK_HOLIDAYS_ON_TOP_OF_ALLOWANCE }
    }) { rules { id revision } error { __typename } } }
  }`,
    { id: termsId, type: timeOffTypeId },
  );
  const body = (await response.json()) as {
    data: {
      timeOff: { saveTimeOffPolicy: { rules: { id: string; revision: number }; error: unknown } };
    };
  };
  expect(body.data.timeOff.saveTimeOffPolicy.error).toBeNull();
  return body.data.timeOff.saveTimeOffPolicy.rules;
}
