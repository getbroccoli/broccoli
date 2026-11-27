import { afterEach, beforeEach, vi } from "vitest";

import { approveReviewedImport, expect, test, TEST_OWNER, type TestEnv } from "#test/support";

test("the owner previews, books, reads and cancels leave over New Year", async ({ env }) => {
  const { browser, employeeId, timeOffTypeId } = await setUpBooking(env);
  const input = { employeeId, timeOffTypeId, startDate: "2026-12-31", endDate: "2027-01-04" };
  const days = [
    { date: "2026-12-31", dayPart: "FULL_DAY" },
    { date: "2027-01-04", dayPart: "FULL_DAY" },
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
          timeOff: {
            id: expect.any(String) as unknown,
            bookedAt: expect.any(String) as unknown,
            cost: 2,
            days,
            history: { edges: [{ node: { operation: "CREATED" } }] },
          },
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
    timeOff { cancelTimeOff(input: $input) {
      cancelledTimeOffId
      error { __typename ... on Error { message } }
    } }
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

test("a colleague sees booked days on Who's out with empty history", async ({ env }) => {
  const { employeeId, booking } = await setUpBookingWithHistory(env);
  const credentials = { email: "ben@example.com", password: TEST_OWNER.password };
  const user = await env.seed.user(credentials);
  await env.seed.employee({ userId: user.id });
  const { browser } = await env.signIn(credentials);

  const result = await browser.graphql(
    `query Calendar($id: ID!) {
    employee(id: $id) { whosOut(from: "2026-12-07", until: "2026-12-08") {
      timeOff { id history { edges { node { operation } } pageInfo { hasNextPage endCursor } } }
    } }
  }`,
    { id: employeeId },
  );

  expect(await result.json()).toEqual({
    data: {
      employee: {
        whosOut: {
          timeOff: [
            {
              id: booking.id,
              history: {
                edges: [],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          ],
        },
      },
    },
  });
});

test("a time off history line returns the booking's note, cost and booking time to its reader", async ({
  env,
}) => {
  const { browser, booking } = await setUpBookingWithHistory(env);

  const result = await browser.graphql(
    `query History($id: ID!) {
    recordHistory(recordType: TIME_OFF, recordId: $id) { edges { node {
      record { ... on TimeOff { id note cost bookedAt } }
    } } }
  }`,
    { id: booking.id },
  );

  expect(await result.json()).toEqual({
    data: {
      recordHistory: {
        edges: [
          {
            node: {
              record: {
                id: booking.id,
                note: "Visiting family.",
                cost: 1.5,
                bookedAt: booking.bookedAt,
              },
            },
          },
        ],
      },
    },
  });
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T12:00:00Z"));
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

async function setUpBookingWithHistory(env: TestEnv) {
  const { browser, employeeId, timeOffTypeId } = await setUpBooking(env);
  const response = await browser.graphql(BOOK_TIME_OFF, {
    input: {
      employeeId,
      timeOffTypeId,
      startDate: "2026-12-07",
      endDate: "2026-12-08",
      halfDays: [{ date: "2026-12-08", dayPart: "MORNING" }],
      note: "Visiting family.",
    },
  });
  const body = (await response.json()) as {
    data: { timeOff: { bookTimeOff: { timeOff: { id: string; bookedAt: string } } } };
  };
  const booking = body.data.timeOff.bookTimeOff.timeOff;
  expect(booking).toMatchObject({
    bookedAt: expect.any(String) as unknown,
    history: { edges: [{ node: { operation: "CREATED" } }] },
  });
  return { browser, employeeId, booking };
}

const BOOK_TIME_OFF = `mutation Book($input: TimeOffBookInput!) {
  timeOff { bookTimeOff(input: $input) {
    timeOff { id bookedAt cost days { date dayPart } history { edges { node { operation } } } }
    error { __typename }
  } }
}`;

const WHOS_OUT = `query Calendar($employeeId: ID!) {
  employee(id: $employeeId) {
    whosOut(from: "2026-12-31", until: "2027-01-04") { timeOff { cost days { date dayPart } } }
  }
}`;
