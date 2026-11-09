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
      terms { id } error { __typename }
    } }
  }`);
  const createdBody = (await created.json()) as {
    data: { employees: { createTerms: { terms: { id: string }; error: unknown } } };
  };
  expect(createdBody.data.employees.createTerms.error).toBeNull();
  const termsId = createdBody.data.employees.createTerms.terms.id;
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
              workingWeek: [
                { source: "FROM_THEIR_TERMS", week: { bankHolidayCalendar: "ENGLAND_AND_WALES" } },
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

const CHANGE_TERMS = `mutation Move($input: EmployeeTermsChangeInput!) {
  employees { changeTerms(input: $input) {
    moved { employee { id } startDate } skipped { employee { id } reason } error { __typename }
  } }
}`;
