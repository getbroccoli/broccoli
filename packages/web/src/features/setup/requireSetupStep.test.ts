import { isRedirect } from "@tanstack/react-router";
import { assert, expect, it } from "vitest";

import { requireFinishedSetup, requireSetupStep, setupStepPage } from "./requireSetupStep";

it("sends a signed-out visitor without setup to login with their destination", () => {
  const href = "/setup/import?source=slack";
  let caught: unknown;

  try {
    requireSetupStep("IMPORT", {
      context: { me: null, holdsSetup: false, setupStep: "COMPANY", mode: "SELF_HOSTED" },
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
    context: { me: null, holdsSetup: true, setupStep: "IMPORT", mode: "SELF_HOSTED" },
    location: { href: "/setup/import" },
  });

  expect(result).toBeUndefined();
});

it.each([
  ["COMPANY", "/setup/company", "DONE", "/people"],
  ["IMPORT", "/setup/ai", "DONE", "/people"],
  ["OWNER", "/setup", "DONE", "/people"],
  ["DONE", "/people", "IMPORT", "/setup/import"],
] as const)(
  "sends a signed-in user at %s to %s from the wrong step",
  (setupStep, to, requestedStep, href) => {
    const me = { id: "owner" };
    let caught: unknown;

    try {
      requireSetupStep(requestedStep, {
        context: { me, holdsSetup: false, setupStep, mode: "SELF_HOSTED" },
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
      context: { me: null, holdsSetup: true, setupStep: "OWNER", mode: "SELF_HOSTED" },
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
    context: { me, holdsSetup: false, setupStep: "DONE", mode: "SELF_HOSTED" },
    location: { href: "/people" },
  });

  expect(result).toBe(me);
});

it("enters self-hosted import through Setup AI", () => {
  expect(setupStepPage("IMPORT", "SELF_HOSTED")).toBe("/setup/ai");
});

it("enters managed import through gathering people", () => {
  expect(setupStepPage("IMPORT", "MANAGED")).toBe("/setup/import");
});

it.each(["SELF_HOSTED", "MANAGED"] as const)(
  "keeps other setup destinations unchanged in %s",
  (mode) => {
    expect(setupStepPage("COMPANY", mode)).toBe("/setup/company");
    expect(setupStepPage("OWNER", mode)).toBe("/setup");
    expect(setupStepPage("DONE", mode)).toBe("/people");
  },
);
