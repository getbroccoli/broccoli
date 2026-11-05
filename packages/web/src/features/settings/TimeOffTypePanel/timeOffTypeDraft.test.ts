import { describe, expect, it } from "vitest";

import { draftErrors, prepareSave, type TypeDraft, withPolicyEdited } from "./timeOffTypeDraft";

const policy = {
  key: "p1",
  id: "p1",
  name: "20 days plus bank holidays",
  standard: false,
  everUsed: true,
  balance: "BALANCE_FROM_ALLOWANCE",
  days: "20",
  bankHolidaysOnTop: true,
  deleted: false,
} as const;

const saved: TypeDraft = {
  name: "Annual leave",
  icon: "SUN",
  colour: "GREEN",
  reasonVisibleToColleagues: true,
  policies: [policy],
};

describe("draftErrors", () => {
  it.each([
    ["", "required"],
    ["abc", "invalid"],
    ["-1", "invalid"],
    ["20.25", "invalid"],
    ["367", "invalid"],
  ])("refuses an allowance of %j as %s", (days, code) => {
    expect(draftErrors({ ...saved, policies: [{ ...policy, days }] })).toEqual({
      "p1.allowanceDays": code,
    });
  });

  it("accepts a half day", () => {
    expect(draftErrors({ ...saved, policies: [{ ...policy, days: "22.5" }] })).toEqual({});
  });
});

describe("prepareSave", () => {
  it("sends only the bank holidays when only they changed", () => {
    const draft = { ...saved, policies: [{ ...policy, bankHolidaysOnTop: false }] };

    expect(prepareSave("t1", saved, draft)?.input).toEqual({
      id: "t1",
      policies: [{ id: "p1", bankHolidays: "BANK_HOLIDAYS_INCLUDED_IN_ALLOWANCE" }],
    });
  });

  it("sends nothing when nothing changed", () => {
    expect(prepareSave("t1", saved, saved)).toBeNull();
  });
});

describe("withPolicyEdited", () => {
  const standard = { ...policy, standard: true, everUsed: false };
  const savedStandard: TypeDraft = { ...saved, policies: [standard] };

  it.each([
    ["UNLIMITED_BALANCE", "Unlimited"],
    ["NO_BALANCE", "Doesn't count"],
  ] as const)("names a standard policy that becomes %s after how it counts", (balance, name) => {
    const edited = withPolicyEdited(savedStandard, savedStandard, "p1", { balance });

    expect(edited.policies[0]!.name).toBe(name);
  });
});
