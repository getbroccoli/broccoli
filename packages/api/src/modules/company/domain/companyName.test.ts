import { expect, it } from "vitest";

import { parseCompanyName } from ".";

it("trims the company name", () => {
  expect(parseCompanyName("  Example Ltd  ")).toBe("Example Ltd");
});

it.each(["", "   "])("refuses an empty or blank company name (%j)", (name) => {
  expect(() => parseCompanyName(name)).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "name", code: "required" }],
    }),
  );
});

it("refuses a company name longer than 100 characters", () => {
  expect(() => parseCompanyName("a".repeat(101))).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "name", code: "tooLong" }],
    }),
  );
});

it("accepts a company name of exactly 100 characters", () => {
  expect(parseCompanyName("a".repeat(100))).toBe("a".repeat(100));
});
