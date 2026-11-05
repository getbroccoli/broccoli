import {
  EMPLOYEE,
  expect,
  timeOffSetupService,
  SETUP_HOLDER,
  test,
  type Answers,
  type Decisions,
  DecisionsError,
} from "#test/support";

test("suggests confident calendars in the order the locations were given", async ({ orm }) => {
  const decisions = scriptedDecisions(["scotland", "england_and_wales", "northern_ireland"]);

  const suggestions = await timeOffSetupService(orm, decisions).suggestLocationCalendars(
    SETUP_HOLDER,
    { locationNames: ["Glasgow", "Leeds", "Belfast"] },
  );

  expect(suggestions).toEqual([
    { locationName: "Glasgow", bankHolidayCalendar: "scotland", unsure: false },
    { locationName: "Leeds", bankHolidayCalendar: "england_and_wales", unsure: false },
    { locationName: "Belfast", bankHolidayCalendar: "northern_ireland", unsure: false },
  ]);
});

test("uses unsure England and Wales for low-confidence and unclear answers", async ({ orm }) => {
  const decisions = scriptedDecisions([null, "not_a_uk_place_or_unclear"]);

  const suggestions = await timeOffSetupService(orm, decisions).suggestLocationCalendars(
    SETUP_HOLDER,
    { locationNames: ["Remote", "Berlin"] },
  );

  expect(suggestions).toEqual([
    { locationName: "Remote", bankHolidayCalendar: "england_and_wales", unsure: true },
    { locationName: "Berlin", bankHolidayCalendar: "england_and_wales", unsure: true },
  ]);
});

test.for([
  new DecisionsError("The model could not be reached", true),
  new DecisionsError("No OpenRouter key", false),
  new DecisionsError("The external agent is selected", false),
])("returns every location as unsure after a decision refusal: %s", async (error, { orm }) => {
  const decisions: Decisions = { decide: () => Promise.reject(error) };

  const suggestions = await timeOffSetupService(orm, decisions).suggestLocationCalendars(
    SETUP_HOLDER,
    { locationNames: ["Glasgow", "Leeds"] },
  );

  expect(suggestions).toEqual([
    { locationName: "Glasgow", bankHolidayCalendar: "england_and_wales", unsure: true },
    { locationName: "Leeds", bankHolidayCalendar: "england_and_wales", unsure: true },
  ]);
});

test("asks once with only unmasked location names and positional question ids", async ({ orm }) => {
  const decisions = scriptedDecisions(["scotland", "england_and_wales"]);

  await timeOffSetupService(orm, decisions).suggestLocationCalendars(SETUP_HOLDER, {
    locationNames: ["Glasgow", "Leeds"],
  });

  expect(decisions.requests).toHaveLength(1);
  const [state, questions, options] = decisions.requests[0]!;
  expect(state).toEqual({ locations: ["Glasgow", "Leeds"] });
  expect(options).toEqual({ unmaskedKeys: ["locations"] });
  expect(Object.keys(questions)).toEqual(["location_1", "location_2"]);
  for (const question of Object.values(questions)) {
    expect(Object.keys(question.options).sort()).toEqual([
      "england_and_wales",
      "northern_ireland",
      "not_a_uk_place_or_unclear",
      "scotland",
    ]);
  }
});

test("an empty location list needs no decision request", async ({ orm }) => {
  const decisions = scriptedDecisions([]);

  expect(
    await timeOffSetupService(orm, decisions).suggestLocationCalendars(SETUP_HOLDER, {
      locationNames: [],
    }),
  ).toEqual([]);
  expect(decisions.requests).toEqual([]);
});

test("asks for only the first hundred locations and marks the rest unsure", async ({ orm }) => {
  const locationNames = Array.from({ length: 102 }, (_, index) => `Office ${index + 1}`);
  const decisions = scriptedDecisions(Array.from({ length: 100 }, () => "scotland"));

  const suggestions = await timeOffSetupService(orm, decisions).suggestLocationCalendars(
    SETUP_HOLDER,
    { locationNames },
  );

  expect(decisions.requests).toHaveLength(1);
  expect(decisions.requests[0]![0]).toEqual({ locations: locationNames.slice(0, 100) });
  expect(Object.keys(decisions.requests[0]![1])).toHaveLength(100);
  expect(suggestions).toEqual(
    locationNames.map((locationName, index) => ({
      locationName,
      bankHolidayCalendar: index < 100 ? "scotland" : "england_and_wales",
      unsure: index >= 100,
    })),
  );
});

test("refuses an employee before asking for suggestions", async ({ orm }) => {
  const decisions = scriptedDecisions(["scotland"]);

  await expect(
    timeOffSetupService(orm, decisions).suggestLocationCalendars(EMPLOYEE, {
      locationNames: ["Glasgow"],
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(decisions.requests).toEqual([]);
});

function scriptedDecisions(
  choices: (string | null)[],
): Decisions & { requests: Parameters<Decisions["decide"]>[] } {
  const requests: Parameters<Decisions["decide"]>[] = [];
  return {
    requests,
    decide: (state, questions, options) => {
      requests.push([state, questions, options]);
      return Promise.resolve(
        Object.fromEntries(
          Object.keys(questions).map((id, index) => [
            id,
            choices[index] == null ? null : { choice: choices[index], confidence: 0.95 },
          ]),
        ) as Answers<typeof questions>,
      );
    },
  };
}
