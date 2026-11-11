import {
  expect,
  test,
  setUpEmploymentTerms,
  readTermsSettings,
  saveTermsWeek,
  saveTermsRules,
} from "#test/support";

test("an admin cancels planned working week and time off assignments through GraphQL", async ({
  env,
}) => {
  const browser = await setUpEmploymentTerms(env);
  const termsId = await env.seed.defaultTermsId();
  const before = await readTermsSettings(browser, termsId);
  const from = `${Number(before.earliestChange.slice(0, 4)) + 1}-01-01`;
  const annual = before.timeOff.find(({ timeOffType }) => timeOffType.typeKey === "ANNUAL_LEAVE")!;
  const week = await saveTermsWeek(browser, termsId);
  const rules = await saveTermsRules(browser, termsId, annual.timeOffType.id);
  const published = await browser.graphql(
    `mutation($id: ID!, $week: ID!, $rules: ID!, $from: Date!) {
    timeOff { publishTerms(input: { termsId: $id, versions: [{ id: $week, revision: 1 }, { id: $rules, revision: 1 }], startDate: $from, owners: [{ termsId: $id }] }) {
      error { __typename }
    } }
  }`,
    { id: termsId, week: week.id, rules: rules.id, from },
  );
  expect(await published.json()).toEqual({ data: { timeOff: { publishTerms: { error: null } } } });
  const planned = await readTermsSettings(browser, termsId);
  const weekAssignmentId = planned.workingWeek.find(({ startDate }) => startDate === from)!.id;
  const policyAssignmentId = planned.timeOff
    .find(({ timeOffType }) => timeOffType.id === annual.timeOffType.id)!
    .versions.find(({ startDate }) => startDate === from)!.id;

  const cancelledWeek = await browser.graphql(
    `mutation($id: ID!) {
    employees { cancelWorkingPatternChange(input: { assignmentId: $id }) { cancelledAssignmentId error { __typename } } }
  }`,
    { id: weekAssignmentId },
  );
  expect(await cancelledWeek.json()).toEqual({
    data: {
      employees: {
        cancelWorkingPatternChange: { cancelledAssignmentId: weekAssignmentId, error: null },
      },
    },
  });
  const cancelledRules = await browser.graphql(
    `mutation($id: ID!) {
    timeOff { cancelPolicyChange(input: { assignmentId: $id }) { cancelledAssignmentId error { __typename } } }
  }`,
    { id: policyAssignmentId },
  );
  expect(await cancelledRules.json()).toEqual({
    data: {
      timeOff: { cancelPolicyChange: { cancelledAssignmentId: policyAssignmentId, error: null } },
    },
  });

  const restored = await readTermsSettings(browser, termsId);
  expect(restored.workingWeek).toEqual(before.workingWeek);
  expect(restored.timeOff).toEqual(before.timeOff);
  const history = await browser.graphql(
    `query($id: ID!) {
    terms(id: $id) { history { edges { node { operation changes { field newValue } } } } }
  }`,
    { id: termsId },
  );
  expect(await history.json()).toMatchObject({
    data: {
      terms: {
        history: {
          edges: expect.arrayContaining([
            { node: { operation: "UPDATED", changes: [{ field: "workingWeek", newValue: null }] } },
            {
              node: {
                operation: "UPDATED",
                changes: [{ field: `timeOff.${annual.timeOffType.id}`, newValue: null }],
              },
            },
          ]) as unknown,
        },
      },
    },
  });
});

test("an admin discards saved settings through GraphQL", async ({ env }) => {
  const browser = await setUpEmploymentTerms(env);
  const termsId = await env.seed.defaultTermsId();
  const before = await readTermsSettings(browser, termsId);
  const annual = before.timeOff.find(({ timeOffType }) => timeOffType.typeKey === "ANNUAL_LEAVE")!;
  const week = await saveTermsWeek(browser, termsId);
  const rules = await saveTermsRules(browser, termsId, annual.timeOffType.id);

  const discardedWeek = await browser.graphql(
    `mutation($id: ID!) {
    employees { discardWorkingPattern(input: { versionId: $id }) { discardedVersionId error { __typename } } }
  }`,
    { id: week.id },
  );
  expect(await discardedWeek.json()).toEqual({
    data: { employees: { discardWorkingPattern: { discardedVersionId: week.id, error: null } } },
  });
  const discardedRules = await browser.graphql(
    `mutation($id: ID!) {
    timeOff { discardTimeOffPolicy(input: { versionId: $id }) { discardedVersionId error { __typename } } }
  }`,
    { id: rules.id },
  );
  expect(await discardedRules.json()).toEqual({
    data: { timeOff: { discardTimeOffPolicy: { discardedVersionId: rules.id, error: null } } },
  });
  expect(await readTermsSettings(browser, termsId)).toEqual(before);
});
