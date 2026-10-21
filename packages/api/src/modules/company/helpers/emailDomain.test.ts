import { expect, it } from "vitest";

import { emailDomain, nameFromDomain } from "./emailDomain";

it("reads an email's domain lowercased", () => {
  expect(emailDomain("owner@Mail.Example.COM")).toBe("mail.example.com");
});

it("reads no domain from a malformed email", () => {
  expect(emailDomain("not-an-email")).toBeNull();
});

it("names the company after the registered domain's words", () => {
  expect(nameFromDomain("mail.example-robotics.co.uk")).toBe("Example Robotics");
});
