import { expect, test } from "#test/support";

test("the setup holder can read leave choices and ask for a location's calendar", async ({
  env,
  fakeDecisions,
}) => {
  fakeDecisions.answer({ location_1: "scotland" });
  await env.restart({ decisionsUrl: fakeDecisions.url, openRouterKey: "test-model-key" });
  const browser = await env.startSetupAtImport();
  await env.seed.aiSource("openrouter");

  const response = await browser.graphql(`query {
    leaveSetup {
      annualLeavePolicies { id name daysForFiveDayWeek bankHolidaysOnTop }
      bankHolidayCalendars { calendar countThisYear }
    }
    locationCalendarSuggestions(locationNames: ["Glasgow"]) { locationName bankHolidayCalendar unsure }
  }`);

  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    data: {
      leaveSetup: {
        annualLeavePolicies: {
          id: string;
          name: string;
          daysForFiveDayWeek: number;
          bankHolidaysOnTop: boolean;
        }[];
        bankHolidayCalendars: { calendar: string; countThisYear: number }[];
      };
    };
  };
  expect(body).not.toHaveProperty("errors");
  expect(body.data.leaveSetup.annualLeavePolicies).toHaveLength(3);
  expect(body.data.leaveSetup.annualLeavePolicies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: expect.any(String) as unknown,
        name: "UK statutory minimum",
        daysForFiveDayWeek: 28,
        bankHolidaysOnTop: false,
      }),
      expect.objectContaining({
        id: expect.any(String) as unknown,
        name: "20 days plus bank holidays",
        daysForFiveDayWeek: 20,
        bankHolidaysOnTop: true,
      }),
      expect.objectContaining({
        id: expect.any(String) as unknown,
        name: "25 days plus bank holidays",
        daysForFiveDayWeek: 25,
        bankHolidaysOnTop: true,
      }),
    ]),
  );
  expect(body.data.leaveSetup.bankHolidayCalendars).toHaveLength(3);
  expect(body.data.leaveSetup.bankHolidayCalendars).toEqual(
    expect.arrayContaining([
      { calendar: "ENGLAND_AND_WALES", countThisYear: expect.any(Number) as unknown },
      { calendar: "SCOTLAND", countThisYear: expect.any(Number) as unknown },
      { calendar: "NORTHERN_IRELAND", countThisYear: expect.any(Number) as unknown },
    ]),
  );
  expect(body).toMatchObject({
    data: {
      locationCalendarSuggestions: [
        { locationName: "Glasgow", bankHolidayCalendar: "SCOTLAND", unsure: false },
      ],
    },
  });
});
