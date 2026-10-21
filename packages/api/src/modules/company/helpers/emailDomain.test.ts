import { expect, it } from "vitest";

import { companyDomain, nameFromDomain } from "./emailDomain";

it.each(["example-robotics.com", "example-robotics.co.uk", "mail.example-robotics.com"])(
  "reads the lowercased company domain %s from a work email",
  (domain) => {
    expect(companyDomain(`owner@${domain.toUpperCase()}`)).toBe(domain);
  },
);

it.each(["gmail.com", "outlook.de"])(
  "reads no company domain from personal provider %s",
  (domain) => {
    expect(companyDomain(`owner@${domain}`)).toBeNull();
  },
);

it("reads no company domain from a malformed email", () => {
  expect(companyDomain("not-an-email")).toBeNull();
});

it("names the company after the registered domain's words", () => {
  expect(nameFromDomain("mail.example-robotics.co.uk")).toBe("Example Robotics");
});
