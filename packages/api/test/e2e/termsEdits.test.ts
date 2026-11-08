import { approveReviewedImport, expect, test, TEST_OWNER } from "#test/support";

test("an admin can create, rename and delete terms while the default terms report their blocker", async ({
  env,
}) => {
  const browser = await env.startSetupAtImport();
  expect(await (await approveReviewedImport(browser)).json()).toMatchObject({
    data: { imports: { approve: { error: null } } },
  });
  expect((await browser.post("/api/auth/setup", TEST_OWNER)).status).toBe(200);
  const defaultId = await env.seed.defaultTermsId();

  const createdResponse = await browser.graphql(`mutation {
    employees {
      createTerms(input: { name: "Senior staff", bankHolidayCalendar: SCOTLAND }) {
        terms { id name deleteBlocker }
        error { __typename }
      }
    }
  }`);
  const created = (await createdResponse.json()) as {
    data: { employees: { createTerms: { terms: { id: string } } } };
  };
  expect(created).toEqual({
    data: {
      employees: {
        createTerms: {
          terms: { id: expect.any(String) as unknown, name: "Senior staff", deleteBlocker: null },
          error: null,
        },
      },
    },
  });
  const id = created.data.employees.createTerms.terms.id;

  const renamed = await browser.graphql(
    `mutation Rename($id: ID!) {
    employees {
      updateTerms(input: { id: $id, name: "Senior team" }) {
        terms { id name }
        error { __typename }
      }
    }
  }`,
    { id },
  );
  expect(await renamed.json()).toEqual({
    data: {
      employees: {
        updateTerms: {
          terms: { id, name: "Senior team" },
          error: null,
        },
      },
    },
  });

  const deleted = await browser.graphql(
    `mutation Delete($id: ID!) {
    employees { deleteTerms(input: { id: $id }) { deletedTermsId error { __typename } } }
  }`,
    { id },
  );
  expect(await deleted.json()).toEqual({
    data: { employees: { deleteTerms: { deletedTermsId: id, error: null } } },
  });

  const remaining = await browser.graphql(
    `query Remaining($id: ID!, $defaultId: ID!) {
    terms(id: $id) { id }
    defaultTerms: terms(id: $defaultId) { id deleteBlocker }
    allTerms { id }
  }`,
    { id, defaultId },
  );
  expect(await remaining.json()).toEqual({
    data: {
      terms: null,
      defaultTerms: { id: defaultId, deleteBlocker: "DEFAULT_TERMS" },
      allTerms: [{ id: defaultId }],
    },
  });
});
