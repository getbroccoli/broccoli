import { expect, it } from "vitest";

import { employeeChangeSentence } from "./employeeHistoryText";

it("names the terms and date of a move", () => {
  const sentence = employeeChangeSentence({
    field: "terms",
    oldValue: JSON.stringify({ termsId: "england", startDate: "2026-12-01" }),
    newValue: JSON.stringify({ termsId: "scotland", startDate: "2026-12-01" }),
    oldLabel: "England and Wales",
    newLabel: "Scotland",
  });

  expect(sentence).toBe("changed terms to Scotland from 1 Dec 2026");
});

it("names the terms and date of a cancelled move", () => {
  const sentence = employeeChangeSentence({
    field: "terms",
    oldValue: JSON.stringify({ termsId: "scotland", startDate: "2026-12-01" }),
    newValue: null,
    oldLabel: "Scotland",
    newLabel: null,
  });

  expect(sentence).toBe("cancelled the change of terms to Scotland from 1 Dec 2026");
});

it("leaves another field to the generic history wording", () => {
  const sentence = employeeChangeSentence({
    field: "jobTitle",
    oldValue: "Designer",
    newValue: "Lead designer",
  });

  expect(sentence).toBeNull();
});

it("describes giving a person their own working week", () => {
  const sentence = employeeChangeSentence({
    field: "workingWeek",
    oldValue: JSON.stringify({ week: null, startDate: "2026-12-01" }),
    newValue: JSON.stringify({ week: fourDays, startDate: "2026-12-01" }),
  });

  expect(sentence).toBe("gave them their own working week, Mon–Thu, 8 hours, from 1 Dec 2026");
});

it("describes changing a person's own working week", () => {
  const sentence = employeeChangeSentence({
    field: "workingWeek",
    oldValue: JSON.stringify({
      week: { minutes: [420, 420, 420, 420, 420, 0, 0], bankHolidayCalendar: "england_and_wales" },
      startDate: "2026-12-01",
    }),
    newValue: JSON.stringify({ week: fourDays, startDate: "2026-12-01" }),
  });

  expect(sentence).toBe("changed their own working week to Mon–Thu, 8 hours from 1 Dec 2026");
});

it("describes returning a person to their terms' working week", () => {
  const sentence = employeeChangeSentence({
    field: "workingWeek",
    oldValue: JSON.stringify({ week: fourDays, startDate: "2027-01-01" }),
    newValue: JSON.stringify({ week: null, startDate: "2027-01-01" }),
  });

  expect(sentence).toBe("put them back on their terms’ working week from 1 Jan 2027");
});

it("describes cancelling a person's working-week change", () => {
  const sentence = employeeChangeSentence({
    field: "workingWeek",
    oldValue: JSON.stringify({ week: fourDays, startDate: "2026-12-01" }),
    newValue: null,
  });

  expect(sentence).toBe("cancelled the change to their working week from 1 Dec 2026");
});

const fourDays = {
  minutes: [480, 480, 480, 480, 0, 0, 0],
  bankHolidayCalendar: "england_and_wales",
};
