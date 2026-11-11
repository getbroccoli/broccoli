import {
  expect,
  test,
  setUpEmploymentTerms,
  readTermsSettings,
  saveTermsWeek,
  saveTermsRules,
} from "#test/support";

test("an admin saves two sections and publishes them together, then publishes one section", async ({
  env,
}) => {
  const browser = await setUpEmploymentTerms(env);
  const termsId = await env.seed.defaultTermsId();
  const before = await readTermsSettings(browser, termsId);
  const annual = before.timeOff.find(({ timeOffType }) => timeOffType.typeKey === "ANNUAL_LEAVE")!;
  const week = await saveTermsWeek(browser, termsId);
  const rules = await saveTermsRules(browser, termsId, annual.timeOffType.id);

  const saved = await readTermsSettings(browser, termsId);
  expect(saved).toMatchObject({
    hasUnpublishedChanges: true,
    workingWeek: before.workingWeek,
    unpublishedWorkingWeek: week,
    timeOff: expect.arrayContaining([
      expect.objectContaining({
        timeOffType: annual.timeOffType,
        versions: annual.versions,
        unpublished: rules,
      }),
    ]) as unknown,
  });
  const suggestions = await browser.graphql(
    `query($id: ID!, $from: Date!) {
    terms(id: $id) { publishSuggestions(from: $from) {
      versions { id revision timeOffTypeId }
      owners { termsId employeeId name versionIds reached { id } }
    } }
  }`,
    { id: termsId, from: before.earliestChange },
  );
  expect(await suggestions.json()).toMatchObject({
    data: {
      terms: {
        publishSuggestions: {
          versions: expect.arrayContaining([
            { ...week, timeOffTypeId: null },
            { ...rules, timeOffTypeId: annual.timeOffType.id },
          ]) as unknown,
          owners: [
            expect.objectContaining({
              termsId,
              employeeId: null,
              name: "England and Wales",
              versionIds: expect.arrayContaining([week.id, rules.id]) as unknown,
            }),
          ],
        },
      },
    },
  });

  const published = await browser.graphql(
    `mutation($id: ID!, $week: ID!, $weekRevision: Int!, $rules: ID!, $rulesRevision: Int!, $from: Date!) {
    timeOff { publishTerms(input: {
      termsId: $id, versions: [{ id: $week, revision: $weekRevision }, { id: $rules, revision: $rulesRevision }],
      startDate: $from, owners: [{ termsId: $id }]
    }) { terms { id hasUnpublishedChanges } error { __typename } } }
  }`,
    {
      id: termsId,
      week: week.id,
      weekRevision: week.revision,
      rules: rules.id,
      rulesRevision: rules.revision,
      from: before.earliestChange,
    },
  );
  expect(await published.json()).toEqual({
    data: {
      timeOff: {
        publishTerms: {
          terms: { id: termsId, hasUnpublishedChanges: false },
          error: null,
        },
      },
    },
  });
  const applied = await readTermsSettings(browser, termsId);
  expect(applied.workingWeek).toMatchObject([
    { startDate: before.earliestChange, mondayMinutes: 480, fridayMinutes: 0 },
  ]);
  expect(applied.timeOff).toContainEqual(
    expect.objectContaining({
      timeOffType: annual.timeOffType,
      versions: [
        expect.objectContaining({
          startDate: before.earliestChange,
          yearlyEntitlement: { days: 22 },
        }),
      ],
      unpublished: null,
    }),
  );

  const second = await saveTermsWeek(browser, termsId, 420);
  const single = await browser.graphql(publishOne, {
    id: termsId,
    revision: second.revision,
    versionId: second.id,
    from: before.earliestChange,
  });
  expect(await single.json()).toMatchObject({
    data: { timeOff: { publishTerms: { error: null, terms: { hasUnpublishedChanges: false } } } },
  });
  const updated = await readTermsSettings(browser, termsId);
  expect(updated.workingWeek).toMatchObject([{ mondayMinutes: 420 }]);
  expect(updated.timeOff).toEqual(applied.timeOff);
});

test("an admin publishes new terms from their earliest change date", async ({ env }) => {
  const browser = await setUpEmploymentTerms(env);
  const response = await browser.graphql(`mutation {
    employees { createTerms(input: { name: "Scotland", bankHolidayCalendar: SCOTLAND }) {
      terms { id earliestChange hasUnpublishedChanges workingWeek { id } unpublishedWorkingWeek { id revision } }
      error { __typename }
    } }
  }`);
  const created = (await response.json()) as {
    data: {
      employees: {
        createTerms: {
          terms: {
            id: string;
            earliestChange: string;
            unpublishedWorkingWeek: { id: string; revision: number };
          };
        };
      };
    };
  };
  expect(created).toMatchObject({
    data: {
      employees: {
        createTerms: {
          error: null,
          terms: {
            hasUnpublishedChanges: true,
            workingWeek: [],
            unpublishedWorkingWeek: { revision: 1 },
          },
        },
      },
    },
  });
  const terms = created.data.employees.createTerms.terms;

  const published = await browser.graphql(publishOne, {
    id: terms.id,
    versionId: terms.unpublishedWorkingWeek.id,
    revision: terms.unpublishedWorkingWeek.revision,
    from: terms.earliestChange,
  });

  expect(await published.json()).toMatchObject({
    data: {
      timeOff: {
        publishTerms: { error: null, terms: { id: terms.id, hasUnpublishedChanges: false } },
      },
    },
  });
  expect((await readTermsSettings(browser, terms.id)).workingWeek).toMatchObject([
    {
      startDate: terms.earliestChange,
      endDate: null,
      mondayMinutes: 450,
      bankHolidayCalendar: "SCOTLAND",
    },
  ]);
});

const publishOne = `mutation($id: ID!, $versionId: ID!, $revision: Int!, $from: Date!) {
  timeOff { publishTerms(input: { termsId: $id, versions: [{ id: $versionId, revision: $revision }], startDate: $from, owners: [{ termsId: $id }] }) {
    terms { id hasUnpublishedChanges } error { __typename }
  } }
}`;
