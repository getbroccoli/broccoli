import {
  expect,
  OWNER,
  seedTimeOffPolicy,
  test,
  TEST_OWNER,
  testTransactor,
  timeOffService,
} from "#test/support";

import { connectDatabase } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";

test("returns an owner's employee time off figures through GraphQL", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const employee = await env.seed.employee({ startDate: "2025-01-01" });
  const database = connectDatabase(env.db.url, createLogger("silent"));
  try {
    const service = timeOffService(database.orm, { today: new Date().toISOString().slice(0, 10) });
    const termsId = await env.seed.defaultTermsId();
    const policy = (await service.listPolicies(OWNER, database.orm)).find(
      ({ key }) => key === "uk_statutory_minimum",
    )!;
    await testTransactor(database.orm)((tx) =>
      service.linkTermsPolicies(OWNER, tx, {
        termsId,
        timeOffPolicyIds: [policy.id],
      }),
    );
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
      timeOffTypes { timeOffType { name icon colour } daysTakenThisYear }
    }
  }`);

  expect(await response.json()).toEqual({
    data: {
      timeOffSettings: {
        peopleWithTimeOff: 0,
        timeOffTypes: [
          {
            timeOffType: { name: "Annual leave", icon: "SUN", colour: "GREEN" },
            daysTakenThisYear: 0,
          },
          {
            timeOffType: { name: "Sickness", icon: "THERMOMETER", colour: "CORAL" },
            daysTakenThisYear: 0,
          },
          {
            timeOffType: { name: "Family leave", icon: "BABY", colour: "PINK" },
            daysTakenThisYear: 0,
          },
          {
            timeOffType: { name: "Other", icon: "CONFETTI", colour: "YELLOW" },
            daysTakenThisYear: 0,
          },
          {
            timeOffType: { name: "Moving day", icon: "SUN", colour: "YELLOW" },
            daysTakenThisYear: 0,
          },
        ],
      },
    },
  });
});

test("an owner raises Annual leave to 22 days over GraphQL and the person's panel shows it", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();
  const employee = await env.seed.employee({ startDate: "2025-01-01" });
  const database = connectDatabase(env.db.url, createLogger("silent"));
  let policyId: string;
  let typeId: string;
  try {
    const service = timeOffService(database.orm, { today: new Date().toISOString().slice(0, 10) });
    const policy = (await service.listPolicies(OWNER, database.orm)).find(
      ({ key }) => key === "uk_20_days_plus_bank_holidays",
    )!;
    policyId = policy.id;
    const types = await service.listTimeOffTypes(OWNER);
    typeId = types.timeOffTypes.find(({ timeOffType }) => timeOffType.typeKey === "annual_leave")!
      .timeOffType.id;
    const termsId = await env.seed.defaultTermsId();
    await testTransactor(database.orm)((tx) =>
      service.linkTermsPolicies(OWNER, tx, { termsId, timeOffPolicyIds: [policy.id] }),
    );
  } finally {
    await database.close();
  }
  const opened = await browser.graphql(
    `query($id: ID!) {
    timeOffSettings { timeOffType(id: $id) { timeOffType { id name } policies { id allowance { days } } } }
  }`,
    { id: typeId },
  );
  expect(await opened.json()).toMatchObject({
    data: {
      timeOffSettings: {
        timeOffType: {
          timeOffType: { id: typeId, name: "Annual leave" },
          policies: expect.arrayContaining([{ id: policyId, allowance: { days: 20 } }]) as unknown,
        },
      },
    },
  });

  const saved = await browser.graphql(
    `mutation($input: TimeOffTypeSaveInput!) {
    timeOffType { save(input: $input) {
      timeOffType { timeOffType { id } policies { id allowance { days bankHolidays } } }
      allowancesUpdated error { __typename }
    } }
  }`,
    {
      input: {
        id: typeId,
        policies: [
          {
            id: policyId,
            name: "22 days plus bank holidays",
            allowanceDays: 22,
            bankHolidays: "BANK_HOLIDAYS_ON_TOP_OF_ALLOWANCE",
          },
        ],
      },
    },
  );

  expect(await saved.json()).toMatchObject({
    data: {
      timeOffType: {
        save: {
          error: null,
          allowancesUpdated: 1,
          timeOffType: {
            timeOffType: { id: typeId },
            policies: expect.arrayContaining([
              {
                id: policyId,
                allowance: { days: 22, bankHolidays: "BANK_HOLIDAYS_ON_TOP_OF_ALLOWANCE" },
              },
            ]) as unknown,
          },
        },
      },
    },
  });
  const panel = await browser.graphql(timeOffQuery, { id: employee.id });
  const response = (await panel.json()) as {
    data: {
      employee: {
        timeOffTypes: { entitlement: number; bankHolidays: number; remaining: number }[];
      };
    };
  };
  const [annual] = response.data.employee.timeOffTypes;
  expect(annual!.entitlement).toBe(22 + annual!.bankHolidays);
  expect(annual!.remaining).toBe(22);
});

const timeOffQuery = `query EmployeeTimeOff($id: ID!) {
  employee(id: $id) {
    timeOffTypes { timeOffType { name } balance entitlement bankHolidays used remaining }
  }
}`;
