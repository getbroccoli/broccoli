import { expect, it } from "vitest";

import { MANAGED_INSTANCE_CREDENTIAL } from "#test/support";

import { InvalidAssignmentError, InvalidTokenError } from "../domain";
import { parseInitClaims, parseTicketClaims } from "./claims";

const CONFIG = {
  companyId: "c-acme",
  publicOrigin: "https://acme.example.com",
  websiteOrigin: "https://www.example.com",
  instanceCredential: MANAGED_INSTANCE_CREDENTIAL,
};

it("parses an init assignment", () => {
  expect(parseInitClaims({ purpose: "init", config: CONFIG })).toEqual({
    assignment: {
      companyId: CONFIG.companyId,
      publicOrigin: CONFIG.publicOrigin,
      websiteOrigin: CONFIG.websiteOrigin,
    },
    instanceCredential: MANAGED_INSTANCE_CREDENTIAL,
  });
});

it.each([
  ["missing", undefined],
  ["null", null],
  ["empty", ""],
  ["wrong prefix", `xx_${"a".repeat(64)}`],
  ["too short", `ib_${"a".repeat(63)}`],
  ["too long", `ib_${"a".repeat(65)}`],
  ["uppercase", `ib_${"A".repeat(64)}`],
  ["non-hex", `ib_${"g".repeat(64)}`],
])("refuses a %s instance credential", (_kind, instanceCredential) => {
  expect(() =>
    parseInitClaims({
      purpose: "init",
      config: { ...CONFIG, instanceCredential },
    }),
  ).toThrow(InvalidAssignmentError);
});

it("refuses a token for another purpose", () => {
  expect(() => parseInitClaims({ purpose: "entry", config: CONFIG })).toThrow(InvalidTokenError);
});

it("refuses an origin with a path", () => {
  expect(() =>
    parseInitClaims({
      purpose: "init",
      config: { ...CONFIG, publicOrigin: "https://acme.example.com/x" },
    }),
  ).toThrow(InvalidAssignmentError);
});

const TICKET = {
  sub: "subject-1",
  email: "Owner@Example.com",
  name: "Ada Owner",
  company: "c-acme",
  state: "a".repeat(64),
  jti: "2f1c7c1e-7e47-4a39-9a6b-6c1b1f7b2d10",
  iat: 1_800_000_000,
  exp: 1_800_000_060,
};

it("parses a ticket and lowercases the email", () => {
  expect(parseTicketClaims(TICKET)).toEqual({
    subject: "subject-1",
    email: "owner@example.com",
    name: "Ada Owner",
    company: "c-acme",
    state: "a".repeat(64),
    jti: TICKET.jti,
    expiresAt: new Date(1_800_000_060_000),
    method: null,
  });
});

it("accepts an empty name", () => {
  expect(parseTicketClaims({ ...TICKET, name: "" }).name).toBe("");
});

it.each([
  ["a missing subject", { sub: undefined }],
  ["no subject", { sub: "" }],
  ["a subject over 255 characters", { sub: "a".repeat(256) }],
  ["a NUL in the subject", { sub: "a\u0000b" }],
  ["an invalid email", { email: "not-an-email" }],
  ["a missing email", { email: undefined }],
  ["a NUL in the name", { name: "a\u0000b" }],
  ["a name over 255 characters", { name: "a".repeat(256) }],
  ["a malformed state", { state: "xyz" }],
  ["a jti that is not a UUID", { jti: "1" }],
  ["a missing jti", { jti: undefined }],
  ["a missing expiry", { exp: undefined }],
  ["a fractional expiry", { exp: TICKET.exp + 0.5 }],
  ["a purpose claim", { purpose: "init" }],
])("refuses a ticket with %s", (_kind, override) => {
  expect(() => parseTicketClaims({ ...TICKET, ...override })).toThrow(InvalidTokenError);
});

it.each(["google", "email"])("reads the %s sign-in method", (method) => {
  expect(parseTicketClaims({ ...TICKET, method }).method).toBe(method);
});

it("accepts a ticket without a sign-in method as unknown", () => {
  expect(parseTicketClaims(TICKET).method).toBeNull();
});

it("accepts an unrecognised sign-in method as unknown", () => {
  expect(parseTicketClaims({ ...TICKET, method: "microsoft" }).method).toBeNull();
});
