import { expect, OWNER, test, workingPatternService } from "#test/support";
import type { WeekdayMinutes } from "../domain";

test("policy names must be nonblank and unique when created or renamed", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const input = { minutes: [450, 0, 0, 0, 0, 0, 0] as const, fullDayMinutes: 450 };
  const policy = await patterns.createPolicy(OWNER, { ...input, name: "Monday" });

  await expect(patterns.createPolicy(OWNER, { ...input, name: "  " })).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "required" }],
  });
  await expect(patterns.createPolicy(OWNER, { ...input, name: "Monday" })).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "taken" }],
  });
  await expect(
    patterns.renamePolicy(OWNER, { policyId: policy.id, name: " " }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "required" }],
  });
  await expect(
    patterns.renamePolicy(OWNER, { policyId: policy.id, name: "Standard" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "taken" }],
  });
});

test("weekday minutes require exactly seven integers between zero and 1440", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const input = { name: "Invalid", fullDayMinutes: 1440 };

  await expect(
    patterns.createPolicy(OWNER, {
      ...input,
      minutes: [450, 0, 0, 0, 0, 0] as unknown as WeekdayMinutes,
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "minutes", code: "out_of_range" }],
  });
  await expect(
    patterns.createPolicy(OWNER, {
      ...input,
      minutes: [450, 0, 0, 0, 0, 0, 0, 0] as unknown as WeekdayMinutes,
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "minutes", code: "out_of_range" }],
  });
  await expect(
    patterns.createPolicy(OWNER, {
      ...input,
      minutes: [-1, 450, 0, 0, 0, 0, 0],
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "minutes", code: "out_of_range" }],
  });
  await expect(
    patterns.createPolicy(OWNER, {
      ...input,
      minutes: [1441, 0, 0, 0, 0, 0, 0],
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "minutes", code: "out_of_range" }],
  });
  await expect(
    patterns.createPolicy(OWNER, {
      ...input,
      minutes: [450.5, 0, 0, 0, 0, 0, 0],
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "minutes", code: "out_of_range" }],
  });
});

test("a policy needs at least one working day", async ({ orm }) => {
  await expect(
    workingPatternService(orm).createPolicy(OWNER, {
      name: "No days",
      minutes: [0, 0, 0, 0, 0, 0, 0],
      fullDayMinutes: 450,
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "minutes", code: "no_working_day" }],
  });
});

test("full day minutes require an integer between one and 1440", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const input = { name: "Invalid", minutes: [1, 0, 0, 0, 0, 0, 0] as const };

  await expect(patterns.createPolicy(OWNER, { ...input, fullDayMinutes: 0 })).rejects.toMatchObject(
    {
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "fullDayMinutes", code: "out_of_range" }],
    },
  );
  await expect(
    patterns.createPolicy(OWNER, { ...input, fullDayMinutes: 1441 }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "fullDayMinutes", code: "out_of_range" }],
  });
  await expect(
    patterns.createPolicy(OWNER, { ...input, fullDayMinutes: 450.5 }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "fullDayMinutes", code: "out_of_range" }],
  });
});

test("a full day cannot be shorter than the longest weekday", async ({ orm }) => {
  await expect(
    workingPatternService(orm).createPolicy(OWNER, {
      name: "Long Sunday",
      minutes: [240, 0, 0, 0, 0, 0, 480],
      fullDayMinutes: 450,
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "fullDayMinutes", code: "shorter_than_longest_day" }],
  });
});

test("policy changes validate minutes and full day without changing the saved policy", async ({
  orm,
}) => {
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPolicies(OWNER)).find((policy) => policy.isStandard)!;
  const input = { policyId: standard.id, effectiveFrom: "2026-09-01" };

  await expect(
    patterns.changePolicy(OWNER, {
      ...input,
      minutes: [0, 0, 0, 0, 0, 0, 0],
      fullDayMinutes: 450,
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "minutes", code: "no_working_day" }],
  });
  await expect(
    patterns.changePolicy(OWNER, {
      ...input,
      minutes: [450, 450, 450, 450, 480, 0, 0],
      fullDayMinutes: 450,
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "fullDayMinutes", code: "shorter_than_longest_day" }],
  });
  expect(await patterns.listPolicies(OWNER)).toContainEqual(standard);
});

test("a policy change requires a valid calendar date", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPolicies(OWNER)).find((policy) => policy.isStandard)!;
  const input = {
    policyId: standard.id,
    minutes: [450, 0, 0, 0, 0, 0, 0] as const,
    fullDayMinutes: 450,
  };

  await expect(
    patterns.changePolicy(OWNER, { ...input, effectiveFrom: "01/09/2026" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "effectiveFrom", code: "invalid" }],
  });
  await expect(
    patterns.changePolicy(OWNER, { ...input, effectiveFrom: "2026-02-30" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "effectiveFrom", code: "invalid" }],
  });
});
