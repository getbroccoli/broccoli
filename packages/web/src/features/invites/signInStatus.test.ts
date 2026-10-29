import { expect, it } from "vitest";

import type { SignInStatusFragment } from "@/__generated__/graphql";
import { groupInvitees, inviteAction, signInLabel, signInTone } from "./signInStatus";

it("skips joined people with the joined reason even when their email has an account", () => {
  const person = {
    id: "employee-1",
    signInStatus: {
      ...pending,
      state: "JOINED" as const,
      emailHasAccount: true,
      canBeInvited: false,
    },
  };

  const grouped = groupInvitees([person]);

  expect(grouped).toEqual({ invited: [], skipped: [{ person, reason: "joined" }] });
});

it("skips people whose email has an account with the hasAccount reason", () => {
  const person = {
    id: "employee-1",
    signInStatus: { ...pending, emailHasAccount: true, canBeInvited: false },
  };

  const grouped = groupInvitees([person]);

  expect(grouped).toEqual({ invited: [], skipped: [{ person, reason: "hasAccount" }] });
});

it("skips sample data that the server says cannot be invited", () => {
  const person = {
    id: "employee-1",
    signInStatus: {
      ...pending,
      state: "NOT_INVITED" as const,
      expiresAt: null,
      canBeInvited: false,
    },
  };

  const grouped = groupInvitees([person]);

  expect(grouped).toEqual({ invited: [], skipped: [{ person, reason: "sampleData" }] });
});

it("marks only pending invitees as replacing a link", () => {
  const invited = { id: "employee-1", signInStatus: pending };
  const notInvited = {
    id: "employee-2",
    signInStatus: { ...pending, state: "NOT_INVITED" as const, expiresAt: null },
  };

  const grouped = groupInvitees([invited, notInvited]);

  expect(grouped).toEqual({
    invited: [
      { person: invited, replacesLink: true },
      { person: notInvited, replacesLink: false },
    ],
    skipped: [],
  });
});

it("labels a pending invite with the remaining days rounded up", () => {
  const label = signInLabel(pending, now);

  expect(label).toEqual({ state: "Pending", hint: "expires in 3 days" });
});

it("labels a pending invite expiring within a day as expires within a day", () => {
  const status = { ...pending, expiresAt: "2026-10-29T11:00:00Z" };

  const label = signInLabel(status, now);

  expect(label).toEqual({ state: "Pending", hint: "expires within a day" });
});

it("labels a pending invite expiring just under 48 hours later as expires in 2 days", () => {
  const status = { ...pending, expiresAt: "2026-10-30T11:59:00Z" };

  const label = signInLabel(status, now);

  expect(label).toEqual({ state: "Pending", hint: "expires in 2 days" });
});

it("labels a pending invite as expired when its expiry arrives", () => {
  const status = { ...pending, expiresAt: now.toISOString() };

  const label = signInLabel(status, now);

  expect(label).toEqual({ state: "Pending", hint: "expired" });
});

it("labels a failed pending invite as not sent even after expiry", () => {
  const status = { ...pending, expiresAt: "2026-10-27T12:00:00Z", notSent: true };

  const label = signInLabel(status, now);

  expect(label).toEqual({ state: "Pending", hint: "not sent" });
});

it("offers Send invite, prominently, to someone not invited", () => {
  const status = { ...pending, state: "NOT_INVITED" as const, expiresAt: null };

  expect(inviteAction(status, now)).toEqual({ label: "Send invite", prominent: true });
});

it("offers a quiet Resend while an invite is open", () => {
  expect(inviteAction(pending, now)).toEqual({ label: "Resend", prominent: false });
});

it("offers Resend invite, prominently, when an invite was not sent or has expired", () => {
  const notSent = { ...pending, notSent: true };
  const expired = { ...pending, expiresAt: now.toISOString() };

  expect(inviteAction(notSent, now)).toEqual({ label: "Resend invite", prominent: true });
  expect(inviteAction(expired, now)).toEqual({ label: "Resend invite", prominent: true });
});

it("offers no invite action to someone who cannot be invited", () => {
  const joined = { ...pending, state: "JOINED" as const, canBeInvited: false };

  expect(inviteAction(joined, now)).toBeNull();
});

it("tones a sign-in by state, with a failed or expired invite as a problem", () => {
  expect(signInTone({ ...pending, state: "NOT_INVITED", expiresAt: null }, now)).toBe("none");
  expect(signInTone(pending, now)).toBe("waiting");
  expect(signInTone({ ...pending, notSent: true }, now)).toBe("problem");
  expect(signInTone({ ...pending, expiresAt: now.toISOString() }, now)).toBe("problem");
  expect(signInTone({ ...pending, state: "JOINED", canBeInvited: false }, now)).toBe("joined");
});

const now = new Date("2026-10-28T12:00:00Z");

const pending: SignInStatusFragment = {
  state: "PENDING",
  expiresAt: "2026-10-31T00:00:00Z",
  notSent: false,
  emailHasAccount: false,
  canBeInvited: true,
};
