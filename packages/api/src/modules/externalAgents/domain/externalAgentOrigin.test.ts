import { expect, it } from "vitest";

import { isExternalAgentSafeOrigin } from ".";

it.each([
  "https://example.com",
  "https://broccoli.example.com:8443",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
])("allows the origin %s", (origin) => {
  expect(isExternalAgentSafeOrigin(origin)).toBe(true);
});

it.each(["http://example.com", "http://localhost.example.com", "http://127.0.0.1.example.com"])(
  "refuses the insecure origin %s",
  (origin) => {
    expect(isExternalAgentSafeOrigin(origin)).toBe(false);
  },
);

it.each(["", "null", "not an origin", "https://", "file:///tmp/staff"])(
  "refuses a value without an HTTP origin (%s)",
  (origin) => {
    expect(isExternalAgentSafeOrigin(origin)).toBe(false);
  },
);

it("refuses a missing origin", () => {
  expect(isExternalAgentSafeOrigin(null)).toBe(false);
});
