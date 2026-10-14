import { expect, it } from "vitest";

import { readCookie } from "./readCookie";

it("reads the named cookie among others", () => {
  expect(readCookie("a=1; slack_connect=abc.def; b=2", "slack_connect")).toBe("abc.def");
});

it("keeps an equals sign inside the value", () => {
  expect(readCookie("token=a=b", "token")).toBe("a=b");
});

it("does not match a cookie whose name only starts with the name", () => {
  expect(readCookie("tokenx=1", "token")).toBeUndefined();
});

it("is undefined without a header", () => {
  expect(readCookie(undefined, "token")).toBeUndefined();
});
