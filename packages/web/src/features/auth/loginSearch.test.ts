import { expect, it } from "vitest";

import { toLocalPath } from "./loginSearch";

const origin = "http://localhost:5173";

it("keeps a local path with its query and hash", () => {
  expect(toLocalPath("/people?q=ann#x", origin)).toBe("/people?q=ann#x");
});

it("defaults an empty redirect to People", () => {
  expect(toLocalPath("", origin)).toBe("/people");
});

it.each([
  ["an external URL", "https://example.com/x"],
  ["a protocol-relative URL", "//example.com"],
  ["a malformed protocol-relative URL", "//"],
  ["a dot segment that exposes a protocol-relative URL", "/a/..//example.com"],
  ["a backslash", "/\\example.com"],
  ["a JavaScript URL", "javascript:alert(1)"],
  ["a control character", "/peo\nple"],
])("defaults a redirect containing %s to People", (_kind, raw) => {
  expect(toLocalPath(raw, origin)).toBe("/people");
});

it("defaults a login redirect to People to avoid a loop", () => {
  expect(toLocalPath("/login?redirect=/people", origin)).toBe("/people");
});
