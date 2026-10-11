import { expect, it } from "vitest";

import { companyDomain, suggestName } from ".";

it("prefers the trimmed brand name over the email domain", () => {
  expect(suggestName({ brandName: "  Example Labs  ", ownerEmail: "owner@example.com" })).toBe(
    "Example Labs",
  );
});

it("falls back to the email domain when the brand name is blank", () => {
  expect(suggestName({ brandName: "   ", ownerEmail: "owner@example.com" })).toBe("Example");
});

it.each(["example-robotics.com", "example-robotics.co.uk", "mail.example-robotics.com"])(
  "suggests the registered company name from %s",
  (domain) => {
    const ownerEmail = `owner@${domain.toUpperCase()}`;

    expect(companyDomain(ownerEmail)).toBe(domain);
    expect(suggestName({ brandName: null, ownerEmail })).toBe("Example Robotics");
  },
);

it.each(["gmail.com", "outlook.de"])("makes no suggestion for personal provider %s", (domain) => {
  const ownerEmail = `owner@${domain}`;

  expect(companyDomain(ownerEmail)).toBeNull();
  expect(suggestName({ brandName: null, ownerEmail })).toBeNull();
});

it("makes no suggestion for a malformed email", () => {
  expect(companyDomain("not-an-email")).toBeNull();
  expect(suggestName({ brandName: null, ownerEmail: "not-an-email" })).toBeNull();
});
