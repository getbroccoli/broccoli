import { expect, test, TEST_OWNER } from "#test/support";

test("the owner previews a person's new terms, moves them and cancels the move through GraphQL", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();
  const employee = await env.seed.employee({ startDate: "2024-03-01" });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const [year, month] = today.split("-").map(Number);
  const startDate = `${month === 12 ? year! + 1 : year}-${String(month === 12 ? 1 : month! + 1).padStart(2, "0")}-01`;
  const created = await browser.graphql(`mutation {
    employees { createTerms(input: { name: "Scotland", bankHolidayCalendar: SCOTLAND }) {
      terms { id earliestChange unpublishedWorkingWeek { id revision } } error { __typename }
    } }
  }`);
  const createdBody = (await created.json()) as {
    data: {
      employees: {
        createTerms: {
          terms: {
            id: string;
            earliestChange: string;
            unpublishedWorkingWeek: { id: string; revision: number };
          };
          error: unknown;
        };
      };
    };
  };
  expect(createdBody.data.employees.createTerms.error).toBeNull();
  const terms = createdBody.data.employees.createTerms.terms;
  const termsId = terms.id;
  const published = await browser.graphql(
    `mutation($id: ID!, $versionId: ID!, $revision: Int!, $from: Date!) {
    timeOff { publishTerms(input: {
      termsId: $id, versions: [{ id: $versionId, revision: $revision }], startDate: $from, owners: [{ termsId: $id }]
    }) { error { __typename } } }
  }`,
    {
      id: termsId,
      versionId: terms.unpublishedWorkingWeek.id,
      revision: terms.unpublishedWorkingWeek.revision,
      from: terms.earliestChange,
    },
  );
  expect(await published.json()).toEqual({ data: { timeOff: { publishTerms: { error: null } } } });
  const input = { employeeIds: [employee.id], termsId, startDate };

  const preview = await browser.graphql(
    `query Preview($input: EmployeeTermsChangeInput!) {
    termsChangePreview(input: $input) {
      moves { employee { id } startDate employmentTerms { workingWeek {
        source startDate endDate week { mondayMinutes bankHolidayCalendar }
      } } }
      skipped { employee { id } reason }
    }
  }`,
    { input },
  );

  expect(await preview.json()).toMatchObject({
    data: {
      termsChangePreview: {
        moves: [
          {
            employee: { id: employee.id },
            startDate,
            employmentTerms: {
              // Read from the move's date on.
              workingWeek: [
                {
                  source: "FROM_THEIR_TERMS",
                  startDate,
                  endDate: null,
                  week: { mondayMinutes: 450, bankHolidayCalendar: "SCOTLAND" },
                },
              ],
            },
          },
        ],
        skipped: [],
      },
    },
  });
  const moved = await browser.graphql(CHANGE_TERMS, { input });
  expect(await moved.json()).toEqual({
    data: {
      employees: {
        changeTerms: {
          moved: [{ employee: { id: employee.id }, startDate }],
          skipped: [],
          error: null,
        },
      },
    },
  });
  const cancelled = await browser.graphql(
    `mutation Cancel($input: EmployeeTermsCancelChangeInput!) {
    employees { cancelTermsChange(input: $input) { employee { id } error { __typename } } }
  }`,
    { input: { employeeId: employee.id, startDate } },
  );
  expect(await cancelled.json()).toEqual({
    data: {
      employees: {
        cancelTermsChange: { employee: { id: employee.id }, error: null },
      },
    },
  });
});

test("an employee cannot move a person to other terms through GraphQL", async ({ env }) => {
  await env.seed.owner();
  const credentials = { email: "sam@example.com", password: TEST_OWNER.password };
  const user = await env.seed.user(credentials);
  const employee = await env.seed.employee({ userId: user.id });
  const termsId = await env.seed.terms("Scotland");
  const { browser } = await env.signIn(credentials);
  const startDate = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

  const response = await browser.graphql(CHANGE_TERMS, {
    input: { employeeIds: [employee.id], termsId, startDate },
  });

  expect(await response.json()).toMatchObject({ errors: [{ extensions: { code: "FORBIDDEN" } }] });
});

test("returns an invalid move date as a payload field error without top-level errors", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();
  const employee = await env.seed.employee({ startDate: "2024-03-01" });
  const termsId = await env.seed.terms("Scotland");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const startDate = `${Number(today.slice(0, 4)) - 1}-12-31`;

  const response = await browser.graphql(
    `mutation Move($input: EmployeeTermsChangeInput!) {
    employees { changeTerms(input: $input) {
      error { __typename ... on InvalidInputError { fields { field code } } }
    } }
  }`,
    { input: { employeeIds: [employee.id], termsId, startDate } },
  );

  expect(await response.json()).toEqual({
    data: {
      employees: {
        changeTerms: {
          error: {
            __typename: "InvalidInputError",
            fields: [{ field: "startDate", code: "too_early" }],
          },
        },
      },
    },
  });
});

test("previews a move to terms named by an uppercase id", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const employee = await env.seed.employee({ startDate: "2024-03-01" });
  const termsId = await env.seed.terms("Scotland");
  const startDate = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

  const response = await browser.graphql(
    `query Preview($input: EmployeeTermsChangeInput!) {
    termsChangePreview(input: $input) {
      moves { employee { id } employmentTerms { periods { termsName } } }
    }
  }`,
    { input: { employeeIds: [employee.id], termsId: termsId.toUpperCase(), startDate } },
  );

  expect(await response.json()).toEqual({
    data: {
      termsChangePreview: {
        moves: [
          {
            employee: { id: employee.id },
            employmentTerms: {
              periods: [{ termsName: "England and Wales" }, { termsName: "Scotland" }],
            },
          },
        ],
      },
    },
  });
});

const CHANGE_TERMS = `mutation Move($input: EmployeeTermsChangeInput!) {
  employees { changeTerms(input: $input) {
    moved { employee { id } startDate } skipped { employee { id } reason } error { __typename }
  } }
}`;
