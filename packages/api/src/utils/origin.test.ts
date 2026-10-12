import { expect, it } from "vitest";

import { parseOrigin } from "./origin";

it("keeps an https origin without a trailing slash", () => {
  expect(parseOrigin("https://acme.example.com/")).toBe("https://acme.example.com");
});

it.each(["http://127.0.0.1:4000", "http://localhost:4000", "http://[::1]:4000"])(
  "allows loopback origin %s",
  (origin) => {
    expect(parseOrigin(origin)).toBe(origin);
  },
);

it.each([
  ["a path", "https://acme.example.com/app"],
  ["a query", "https://acme.example.com/?x=1"],
  ["a fragment", "https://acme.example.com/#x"],
  ["credentials", "https://user@acme.example.com"],
  ["another protocol", "ftp://acme.example.com"],
  ["no URL", "acme.example.com"],
  ["http outside loopback", "http://acme.example.com"],
])("refuses %s", (_kind, raw) => {
  expect(parseOrigin(raw)).toBeNull();
});
