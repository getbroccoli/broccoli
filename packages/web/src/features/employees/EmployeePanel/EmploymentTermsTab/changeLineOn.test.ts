import { expect, it } from "vitest";
import type { RuleSource } from "@/__generated__/graphql";

import { changeLineOn } from "./employmentTermsView";

it("describes the week and bank holidays that change on the move date", () => {
  const line = changeLineOn(
    [englandWeek],
    [scotlandWeek],
    moveDate,
    today,
    describeWeek,
    "not offered",
  );

  expect(line).toBe("From 1 Dec 2026: Mon–Thu, 8 hours · Scotland bank holidays");
});

it("shows no change line for a person's own week on the move date", () => {
  const own = { ...scotlandWeek, source: "THEIR_OWN" as const };

  const line = changeLineOn([englandWeek], [own], moveDate, today, describeWeek, "not offered");

  expect(line).toBeNull();
});

it("shows no change line when the week reads the same before and after", () => {
  const line = changeLineOn(
    [englandWeek],
    [englandWeek],
    moveDate,
    today,
    describeWeek,
    "not offered",
  );

  expect(line).toBeNull();
});

it("says a type is not offered when nothing applies after the move", () => {
  const line = changeLineOn([englandWeek], [], moveDate, today, describeWeek, "not offered");

  expect(line).toBe("From 1 Dec 2026: not offered");
});

it("compares a past date's change on today, labelled with that date", () => {
  const before = {
    source: "FROM_THEIR_TERMS" as const,
    startDate: "2026-11-09",
    text: "Mon–Fri, 7.5 hours",
  };
  const after = { ...before, text: "Mon–Thu, 8 hours" };

  const line = changeLineOn(
    [before],
    [after],
    "2026-03-01",
    "2026-11-09",
    ({ text }) => ({ text }),
    "not offered",
  );

  expect(line).toBe("From 1 Mar 2026: Mon–Thu, 8 hours");
});

const today = "2026-11-09";
const moveDate = "2026-12-01";

const englandWeek = {
  source: "FROM_THEIR_TERMS" as RuleSource,
  startDate: "2026-11-09",
  endDate: null,
  text: "Mon–Fri, 7.5 hours",
  detail: "England and Wales bank holidays",
};
const scotlandWeek = {
  source: "FROM_THEIR_TERMS" as RuleSource,
  startDate: "2026-12-01",
  endDate: null,
  text: "Mon–Thu, 8 hours",
  detail: "Scotland bank holidays",
};

function describeWeek({ text, detail }: { text: string; detail: string }) {
  return { text, detail };
}
