import { expect, leaveSetupService, OWNER, startLiveDecisions, test } from "#test/support";

/**
 * Whose bank holidays apply at each location, written by hand from the rules: a UK place is its
 * nation, and anything else (no place, a team word, a place abroad) is unsure on England and Wales.
 */
const LOCATIONS = [
  { locationName: "Glasgow", bankHolidayCalendar: "scotland", unsure: false },
  { locationName: "Edinburgh office", bankHolidayCalendar: "scotland", unsure: false },
  { locationName: "Aberdeen site", bankHolidayCalendar: "scotland", unsure: false },
  { locationName: "Belfast", bankHolidayCalendar: "northern_ireland", unsure: false },
  { locationName: "Derry", bankHolidayCalendar: "northern_ireland", unsure: false },
  { locationName: "Leeds", bankHolidayCalendar: "england_and_wales", unsure: false },
  { locationName: "Cardiff", bankHolidayCalendar: "england_and_wales", unsure: false },
  { locationName: "London HQ", bankHolidayCalendar: "england_and_wales", unsure: false },
  { locationName: "Remote", bankHolidayCalendar: "england_and_wales", unsure: true },
  { locationName: "Berlin", bankHolidayCalendar: "england_and_wales", unsure: true },
] as const;

test("suggests each UK location's nation and leaves the others to the owner", async ({
  orm,
  onTestFinished,
}) => {
  const model = await startLiveDecisions();
  onTestFinished(async () => {
    console.info(`Request\n${JSON.stringify(model.requests(), null, 2)}`);
    console.info(`Model cost: $${model.cost().toFixed(5)}`);
    await model.stop();
  });

  const suggestions = await leaveSetupService(orm, model.decisions).suggestLocationCalendars(
    OWNER,
    { locationNames: LOCATIONS.map(({ locationName }) => locationName) },
  );

  expect(suggestions).toEqual(LOCATIONS);
});
