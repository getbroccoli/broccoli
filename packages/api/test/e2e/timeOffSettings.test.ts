import { expect, seedTimeOffPolicy, test } from "#test/support";

import { connectDatabase } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";

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
