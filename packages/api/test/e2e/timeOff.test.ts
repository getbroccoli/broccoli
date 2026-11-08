import {
  expect,
  giveTermsPolicies,
  seedTimeOffPolicy,
  test,
  TEST_OWNER,
  testTransactor,
} from "#test/support";

import { connectDatabase } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";

test("returns an owner's employee time off figures through GraphQL", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const employee = await env.seed.employee({ startDate: "2025-01-01" });
  const database = connectDatabase(env.db.url, createLogger("silent"));
  try {
    await giveTermsPolicies(database.orm, testTransactor(database.orm), {
      termsId: await env.seed.defaultTermsId(),
      policies: [{ key: "uk_statutory_minimum" }],
      today: new Date().toISOString().slice(0, 10),
    });
  } finally {
    await database.close();
  }

  const response = await browser.graphql(timeOffQuery, { id: employee.id });

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
      name: "Study leave", icon: GRADUATION_CAP, colour: BLUE, private: false
    }) {
      timeOffType { id name icon colour private typeKey }
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
      name: "Training", icon: GRADUATION_CAP, colour: BLUE, private: false
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
      name: "Study leave", icon: GRADUATION_CAP, colour: BLUE, private: false
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
