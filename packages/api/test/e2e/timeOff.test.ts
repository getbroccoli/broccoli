import {
  expect,
  seedCurrentAnnualLeaveCard,
  seedTimeOffPolicy,
  test,
  TEST_OWNER,
} from "#test/support";

import { connectDatabase } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";

test("returns an owner's employee time off figures through GraphQL", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const { employeeId } = await seedCurrentAnnualLeaveCard(env);

  const response = await browser.graphql(timeOffQuery, { id: employeeId });

  expect(await response.json()).toEqual({
    data: {
      employee: {
        timeOffTypes: [
          {
            timeOffType: { name: "Annual leave" },
            balance: "BALANCE_FROM_ALLOWANCE",
            entitlement: 28,
            bankHolidays: expect.any(Number) as unknown,
            used: 0,
            remaining: expect.any(Number) as unknown,
          },
        ],
      },
    },
  });
});

test("returns the owner's adjustment in the mutation and the employee's balance history", async ({
  env,
}) => {
  const { browser, user } = await env.signInAsOwner();
  const { employeeId, allowanceId, remaining } = await seedCurrentAnnualLeaveCard(env);
  const comment = "Carried over from last year";

  const adjusted = await browser.graphql(adjustAllowanceMutation, {
    input: { allowanceId, amount: 2, comment },
  });

  expect(await adjusted.json()).toHaveProperty("data.timeOff.adjustAllowance", {
    employeeTimeOffType: { allowanceId, remaining: remaining + 2 },
    error: null,
  });
  const response = await browser.graphql(
    `query($id: ID!) {
    employee(id: $id) { timeOffTypes { allowanceId remaining history { cause amount balanceAfter comment author { userId } } } }
  }`,
    { id: employeeId },
  );
  expect(await response.json()).toHaveProperty("data.employee.timeOffTypes", [
    {
      allowanceId,
      remaining: remaining + 2,
      history: [
        {
          cause: "ALLOWANCE_ADJUSTED",
          amount: 2,
          balanceAfter: remaining + 2,
          comment,
          author: { userId: user.id },
        },
        {
          cause: "TIME_OFF_TURNED_ON",
          amount: remaining,
          balanceAfter: remaining,
          comment: null,
          author: { userId: null },
        },
      ],
    },
  ]);
});

test("returns an invalid adjustment as a field error in the mutation payload", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const { allowanceId } = await seedCurrentAnnualLeaveCard(env);

  const response = await browser.graphql(adjustAllowanceMutation, {
    input: { allowanceId, amount: 0, comment: "Carry-over" },
  });

  expect(await response.json()).toHaveProperty("data.timeOff.adjustAllowance", {
    employeeTimeOffType: null,
    error: { __typename: "InvalidInputError", fields: [{ field: "amount", code: "invalid" }] },
  });
});

test("returns null time off for an employee querying a non-report", async ({ env }) => {
  await env.seed.owner();
  const credentials = { email: "employee@example.com", password: TEST_OWNER.password };
  const user = await env.seed.user(credentials);
  await env.seed.employee({ userId: user.id });
  const coworker = await env.seed.employee();
  const { browser } = await env.signIn(credentials);

  const response = await browser.graphql(timeOffQuery, { id: coworker.id });

  expect(await response.json()).toEqual({ data: { employee: { timeOffTypes: null } } });
});

test("returns every time off type for Settings through GraphQL", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const database = connectDatabase(env.db.url, createLogger("silent"));
  try {
    await seedTimeOffPolicy(database.orm, {
      name: "Moving day",
      balance: "balance_from_allowance",
    });
  } finally {
    await database.close();
  }

  const response = await browser.graphql(`query {
    timeOffSettings {
      peopleWithTimeOff
      timeOffTypes { timeOffType { name icon colour } balance daysTakenThisYear }
    }
  }`);

  expect(await response.json()).toEqual({
    data: {
      timeOffSettings: {
        peopleWithTimeOff: 0,
        timeOffTypes: [
          {
            timeOffType: { name: "Annual leave", icon: "SUN", colour: "GREEN" },
            balance: null,
            daysTakenThisYear: 0,
          },
          {
            timeOffType: { name: "Sickness", icon: "THERMOMETER", colour: "CORAL" },
            balance: null,
            daysTakenThisYear: 0,
          },
          {
            timeOffType: { name: "Family leave", icon: "BABY", colour: "PINK" },
            balance: null,
            daysTakenThisYear: 0,
          },
          {
            timeOffType: { name: "Other", icon: "CONFETTI", colour: "YELLOW" },
            balance: null,
            daysTakenThisYear: 0,
          },
          {
            timeOffType: { name: "Moving day", icon: "SUN", colour: "YELLOW" },
            balance: "BALANCE_FROM_ALLOWANCE",
            daysTakenThisYear: 0,
          },
        ],
      },
    },
  });
});

test("creates and changes a time off type and returns duplicate names as payload errors", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();

  const created = await browser.graphql(`mutation {
    timeOff { createType(input: {
      name: "Study leave", icon: GRADUATION_CAP, colour: BLUE, private: false, approval: MANAGER_APPROVAL
      defaultRules: { balance: NO_BALANCE }
    }) {
      timeOffType { id name icon colour private typeKey defaultRules { balance entitlementDays bankHolidays } }
      error { __typename ... on Error { message } }
    } }
  }`);
  const body = (await created.json()) as {
    data: { timeOff: { createType: { timeOffType: { id: string }; error: null } } };
  };
  expect(body).toEqual({
    data: {
      timeOff: {
        createType: {
          timeOffType: {
            id: expect.any(String) as unknown,
            name: "Study leave",
            icon: "GRADUATION_CAP",
            colour: "BLUE",
            private: false,
            typeKey: null,
            defaultRules: { balance: "NO_BALANCE", entitlementDays: null, bankHolidays: null },
          },
          error: null,
        },
      },
    },
  });
  const { id } = body.data.timeOff.createType.timeOffType;

  const changed = await browser.graphql(
    `mutation($input: TimeOffTypeChangeInput!) {
    timeOff { changeType(input: $input) {
      timeOffType { id name icon colour private typeKey }
      error { __typename ... on Error { message } }
    } }
  }`,
    {
      input: {
        timeOffTypeId: id,
        name: "Training",
        icon: "BOOK_OPEN",
        colour: "PURPLE",
        private: true,
        approval: "MANAGER_APPROVAL",
        defaultRules: { balance: "NO_BALANCE" },
      },
    },
  );
  expect(await changed.json()).toEqual({
    data: {
      timeOff: {
        changeType: {
          timeOffType: {
            id,
            name: "Training",
            icon: "BOOK_OPEN",
            colour: "PURPLE",
            private: true,
            typeKey: null,
          },
          error: null,
        },
      },
    },
  });

  const duplicate = await browser.graphql(`mutation {
    timeOff { createType(input: {
      name: "Training", icon: GRADUATION_CAP, colour: BLUE, private: false, approval: MANAGER_APPROVAL
      defaultRules: { balance: NO_BALANCE }
    }) {
      timeOffType { id }
      error { __typename }
    } }
  }`);
  expect(await duplicate.json()).toEqual({
    data: {
      timeOff: {
        createType: {
          timeOffType: null,
          error: { __typename: "InvalidInputError" },
        },
      },
    },
  });
});

test("deletes an added time off type and returns not found when deleted again", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const created = await browser.graphql(`mutation {
    timeOff { createType(input: {
      name: "Study leave", icon: GRADUATION_CAP, colour: BLUE, private: false, approval: MANAGER_APPROVAL
      defaultRules: { balance: NO_BALANCE }
    }) {
      timeOffType { id }
      error { __typename ... on Error { message } }
    } }
  }`);
  const body = (await created.json()) as {
    data: { timeOff: { createType: { timeOffType: { id: string }; error: null } } };
  };
  expect(body).toEqual({
    data: {
      timeOff: {
        createType: { timeOffType: { id: expect.any(String) as unknown }, error: null },
      },
    },
  });
  const { id } = body.data.timeOff.createType.timeOffType;

  const deleted = await browser.graphql(deleteTypeMutation, { input: { timeOffTypeId: id } });

  expect(await deleted.json()).toEqual({
    data: { timeOff: { deleteType: { deletedTimeOffTypeId: id, error: null } } },
  });

  const refused = await browser.graphql(deleteTypeMutation, {
    input: { timeOffTypeId: id },
  });

  expect(await refused.json()).toEqual({
    data: {
      timeOff: {
        deleteType: {
          deletedTimeOffTypeId: null,
          error: { __typename: "NotFoundError", message: expect.any(String) as unknown },
        },
      },
    },
  });
});

const deleteTypeMutation = `mutation($input: TimeOffTypeDeleteInput!) {
  timeOff { deleteType(input: $input) {
    deletedTimeOffTypeId
    error { __typename ... on Error { message } }
  } }
}`;

const timeOffQuery = `query EmployeeTimeOff($id: ID!) {
  employee(id: $id) {
    timeOffTypes { timeOffType { name } balance entitlement bankHolidays used remaining }
  }
}`;

const adjustAllowanceMutation = `mutation($input: AllowanceAdjustInput!) {
  timeOff { adjustAllowance(input: $input) {
    employeeTimeOffType { allowanceId remaining }
    error { __typename ... on InvalidInputError { fields { field code } } }
  } }
}`;
