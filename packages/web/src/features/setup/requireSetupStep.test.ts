import { isRedirect } from "@tanstack/react-router";
import { assert, expect, it } from "vitest";

import { requireFinishedSetup, requireSetupStep } from "./requireSetupStep";

it("sends a signed-out visitor without setup to login with their destination", () => {
  const href = "/setup/import?source=slack";
  let caught: unknown;

  try {
    requireSetupStep("IMPORT", {
      context: { me: null, holdsSetup: false, setupStep: "COMPANY" },
      location: { href },
    });
  } catch (error) {
    caught = error;
  }

  assert(isRedirect(caught));
  expect(caught.options).toMatchObject({
    to: "/login",
    search: { redirect: href },
    replace: true,
  });
});

it("lets the signed-out setup holder through their current step", () => {
  const result = requireSetupStep("IMPORT", {
    context: { me: null, holdsSetup: true, setupStep: "IMPORT" },
    location: { href: "/setup/import" },
  });

  expect(result).toBeUndefined();
});

it.each([
  ["COMPANY", "/setup/company", "DONE", "/people"],
  ["IMPORT", "/setup/import", "DONE", "/people"],
  ["OWNER", "/setup", "DONE", "/people"],
  ["DONE", "/people", "IMPORT", "/setup/import"],
] as const)(
  "sends a signed-in user at %s to %s from the wrong step",
  (setupStep, to, requestedStep, href) => {
    const me = { id: "owner" };
    let caught: unknown;

    try {
      requireSetupStep(requestedStep, {
        context: { me, holdsSetup: false, setupStep },
        location: { href },
      });
    } catch (error) {
      caught = error;
    }

    assert(isRedirect(caught));
    expect(caught.options).toMatchObject({ to, replace: true });
  },
);

it("sends the setup holder at owner from the import page to owner setup", () => {
  let caught: unknown;

  try {
    requireSetupStep("IMPORT", {
      context: { me: null, holdsSetup: true, setupStep: "OWNER" },
      location: { href: "/setup/import" },
    });
  } catch (error) {
    caught = error;
  }

  assert(isRedirect(caught));
  expect(caught.options).toMatchObject({ to: "/setup", replace: true });
});

it("returns the signed-in user when setup is done", () => {
  const me = { id: "owner" };

  const result = requireFinishedSetup({
    context: { me, holdsSetup: false, setupStep: "DONE" },
    location: { href: "/people" },
  });

  expect(result).toBe(me);
});
