import { afterEach, beforeEach, vi } from "vitest";

import { approveReviewedImport, expect, test, TEST_OWNER, type TestEnv } from "#test/support";

test("the owner previews, books, reads and cancels two working days", async ({ env }) => {
  const { browser, employeeId, timeOffTypeId } = await setUpBooking(env);
  const input = { employeeId, timeOffTypeId, startDate: "2026-12-07", endDate: "2026-12-08" };
  const days = [
    { date: "2026-12-07", dayPart: "FULL_DAY" },
    { date: "2026-12-08", dayPart: "FULL_DAY" },
  ];

  const preview = await browser.graphql(
    `query Preview($input: TimeOffBookInput!) {
    timeOffBookingPreview(input: $input) { cost refusal { reason } }
  }`,
    { input },
  );
  expect(await preview.json()).toEqual({
    data: { timeOffBookingPreview: { cost: 2, refusal: null } },
  });
  const response = await browser.graphql(BOOK_TIME_OFF, { input });
  const booked = (await response.json()) as {
    data: { timeOff: { bookTimeOff: { timeOff: { id: string } } } };
  };
  expect(booked).toEqual({
    data: {
      timeOff: {
        bookTimeOff: {
          timeOff: { id: expect.any(String) as unknown, cost: 2, days },
          error: null,
        },
      },
    },
  });
  const timeOffId = booked.data.timeOff.bookTimeOff.timeOff.id;
  const calendar = await browser.graphql(WHOS_OUT, { employeeId });
  expect(await calendar.json()).toEqual({
    data: { employee: { whosOut: { timeOff: [{ cost: 2, days }] } } },
  });
  const cancelled = await browser.graphql(
    `mutation Cancel($input: TimeOffCancelInput!) {
    timeOff { cancelTimeOff(input: $input) { cancelledTimeOffId error { __typename } } }
  }`,
    { input: { timeOffId } },
  );
  expect(await cancelled.json()).toEqual({
    data: { timeOff: { cancelTimeOff: { cancelledTimeOffId: timeOffId, error: null } } },
  });
  const after = await browser.graphql(WHOS_OUT, { employeeId });
  expect(await after.json()).toEqual({ data: { employee: { whosOut: { timeOff: [] } } } });
});

test("returns a weekend-only booking refusal as an InvalidInputError payload", async ({ env }) => {
  const { browser, employeeId, timeOffTypeId } = await setUpBooking(env);

  const response = await browser.graphql(BOOK_TIME_OFF, {
    input: {
      employeeId,
      timeOffTypeId,
      startDate: "2026-12-05",
      endDate: "2026-12-06",
    },
  });

  expect(await response.json()).toEqual({
    data: {
      timeOff: {
        bookTimeOff: {
          timeOff: null,
          error: { __typename: "InvalidInputError" },
        },
      },
    },
  });
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T12:00:00Z"));
});

afterEach(() => vi.useRealTimers());

async function setUpBooking(env: TestEnv) {
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
          annualLeavePolicyKey: "uk_statutory_minimum",
        },
      ],
      locationTerms: [],
    },
  });
  expect(setup.status).toBe(200);
  const employee = await env.seed.employee({ startDate: "2025-01-01" });
  const response = await browser.graphql(
    `query Terms($id: ID!) {
    terms(id: $id) { timeOff { timeOffType { id typeKey } } }
  }`,
    { id: await env.seed.defaultTermsId() },
  );
  const result = (await response.json()) as {
    data: { terms: { timeOff: { timeOffType: { id: string; typeKey: string } }[] } };
  };
  const annual = result.data.terms.timeOff.find(
    ({ timeOffType }) => timeOffType.typeKey === "ANNUAL_LEAVE",
  )!;
  return { browser, employeeId: employee.id, timeOffTypeId: annual.timeOffType.id };
}

const BOOK_TIME_OFF = `mutation Book($input: TimeOffBookInput!) {
  timeOff { bookTimeOff(input: $input) {
    timeOff { id cost days { date dayPart } }
    error { __typename }
  } }
}`;

const WHOS_OUT = `query Calendar($employeeId: ID!) {
  employee(id: $employeeId) {
    whosOut(from: "2026-12-01", until: "2026-12-31") { timeOff { cost days { date dayPart } } }
  }
}`;
