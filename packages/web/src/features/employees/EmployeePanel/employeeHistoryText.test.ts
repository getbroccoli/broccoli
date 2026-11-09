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
