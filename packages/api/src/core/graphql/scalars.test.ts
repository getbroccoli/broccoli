import { GraphQLError } from "graphql";
import { expect, it } from "vitest";

import { DateScalar, DateTimeScalar } from ".";

it("accepts a real calendar date", () => {
  expect(DateScalar.parseValue("2026-02-28")).toBe("2026-02-28");
  expect(DateScalar.serialize("2026-02-28")).toBe("2026-02-28");
});

it("rejects an impossible calendar date", () => {
  const error = new GraphQLError("Date must be a real date in YYYY-MM-DD format.");

  expect(() => DateScalar.parseValue("2026-02-30")).toThrowError(error);
  expect(() => DateScalar.serialize("2026-02-30")).toThrowError(error);
});

it("rejects a date without two-digit months and days", () => {
  const error = new GraphQLError("Date must be a real date in YYYY-MM-DD format.");

  expect(() => DateScalar.parseValue("2026-1-1")).toThrowError(error);
  expect(() => DateScalar.serialize("2026-1-1")).toThrowError(error);
});

it("parses a date and time with an offset", () => {
  const date = DateTimeScalar.parseValue("2026-10-10T10:46:08+02:00");

  expect(date).toEqual(new Date("2026-10-10T08:46:08.000Z"));
});

it("rejects a date and time without a time zone", () => {
  expect(() => DateTimeScalar.parseValue("2026-10-10T10:46:08")).toThrowError(
    new GraphQLError("DateTime must be an ISO 8601 date and time with a time zone."),
  );
});

it("serialises a date and time as UTC ISO", () => {
  const date = new Date("2026-10-10T10:46:08+02:00");

  expect(DateTimeScalar.serialize(date)).toBe("2026-10-10T08:46:08.000Z");
});
