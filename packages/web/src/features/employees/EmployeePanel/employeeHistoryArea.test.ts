import { expect, it } from "vitest";

import { historyAreaOf } from "./employeeHistoryArea";

it.each(["terms", "workingPattern", "workingWeek", "timeOff.annual"])(
  "classifies a line changing %s as Employment terms",
  (field) => {
    const area = historyAreaOf(["firstName", field]);

    expect(area).toBe("EMPLOYMENT_TERMS");
  },
);

it("classifies a line changing only other fields as Details", () => {
  const area = historyAreaOf(["firstName", "startDate", "timeOff", "termsExtra"]);

  expect(area).toBe("DETAILS");
});
