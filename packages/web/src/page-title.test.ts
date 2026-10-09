import { describe, expect, it } from "vitest";

import { formatPageTitle } from "./page-title";

describe("formatPageTitle", () => {
  it("appends the product name to the page name", () => {
    expect(formatPageTitle("People")).toBe("People · Broccoli");
  });
});
