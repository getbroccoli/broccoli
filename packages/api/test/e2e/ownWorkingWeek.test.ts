import { expect, test, TEST_OWNER } from "#test/support";

test("the owner sets an own week, returns to the terms and cancels that return through GraphQL", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();
  const employee = await env.seed.employee({ startDate: "2024-03-01" });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const [year, month] = today.split("-").map(Number);
  const startDate = `${month === 12 ? year! + 1 : year}-${String(month === 12 ? 1 : month! + 1).padStart(2, "0")}-01`;
  const returnDate = `${startDate.slice(0, 8)}15`;

  const own = await browser.graphql(SET_OWN_WEEK, {
    input: { employeeId: employee.id, startDate, ...fourDays },
  });

  expect(await own.json()).toEqual({
    data: { employees: { setOwnWorkingWeek: { employee: { id: employee.id }, error: null } } },
  });
  const returned = await browser.graphql(
    `mutation Return($input: EmployeeTermsWorkingWeekUseInput!) {
    employees { useTermsWorkingWeek(input: $input) { employee { id } error { __typename } } }
  }`,
    { input: { employeeId: employee.id, startDate: returnDate } },
  );
  expect(await returned.json()).toEqual({
    data: { employees: { useTermsWorkingWeek: { employee: { id: employee.id }, error: null } } },
  });
  const cancelled = await browser.graphql(
    `mutation Cancel($input: EmployeeOwnWorkingWeekCancelChangeInput!) {
    employees { cancelOwnWorkingWeekChange(input: $input) { employee { id } error { __typename } } }
  }`,
    { input: { employeeId: employee.id, startDate: returnDate } },
  );
  expect(await cancelled.json()).toEqual({
    data: {
      employees: { cancelOwnWorkingWeekChange: { employee: { id: employee.id }, error: null } },
    },
  });
});

test("an employee cannot set an own week through GraphQL", async ({ env }) => {
  await env.seed.owner();
  const credentials = { email: "sam@example.com", password: TEST_OWNER.password };
  const user = await env.seed.user(credentials);
  const employee = await env.seed.employee({ userId: user.id });
  const { browser } = await env.signIn(credentials);
  const startDate = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

  const response = await browser.graphql(SET_OWN_WEEK, {
    input: { employeeId: employee.id, startDate, ...fourDays },
  });

  expect(await response.json()).toMatchObject({ errors: [{ extensions: { code: "FORBIDDEN" } }] });
});

const SET_OWN_WEEK = `mutation Set($input: EmployeeOwnWorkingWeekSetInput!) {
  employees { setOwnWorkingWeek(input: $input) { employee { id } error { __typename } } }
}`;
const fourDays = {
  mondayMinutes: 480,
  tuesdayMinutes: 480,
  wednesdayMinutes: 480,
  thursdayMinutes: 480,
  fridayMinutes: 0,
  saturdayMinutes: 0,
  sundayMinutes: 0,
  bankHolidayCalendar: "ENGLAND_AND_WALES",
};
