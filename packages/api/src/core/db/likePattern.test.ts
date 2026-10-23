import { expect, it } from "vitest";

import { containsPattern } from ".";

it("matches text containing an ordinary search anywhere", () => {
  expect(containsPattern("Ada Lovelace")).toBe("%Ada Lovelace%");
});

it("escapes percent so it searches for a literal percent rather than any text", () => {
  expect(containsPattern("100%")).toBe("%100\\%%");
});

it("escapes underscore so it searches for a literal underscore rather than one character", () => {
  expect(containsPattern("first_name")).toBe("%first\\_name%");
});

it("escapes backslashes so they cannot change how the following character is matched", () => {
  expect(containsPattern(String.raw`C:\people`)).toBe(String.raw`%C:\\people%`);
});

it("escapes every special character even when they are next to each other", () => {
  expect(containsPattern(String.raw`\%_`)).toBe(String.raw`%\\\%\_%`);
});

it("matches any text when the search is empty", () => {
  expect(containsPattern("")).toBe("%%");
});
