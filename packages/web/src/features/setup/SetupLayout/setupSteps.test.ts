import { isRedirect } from "@tanstack/react-router";
import { assert, expect, it } from "vitest";

import {
  nextPage,
  previousPage,
  requireFinishedSetup,
  requireSetupPage,
  setupStepPage,
  stepViews,
} from "./setupSteps";

it.each([
  ["COMPANY", "SELF_HOSTED", "/setup/company"],
  ["IMPORT", "SELF_HOSTED", "/setup/ai"],
  ["OWNER", "SELF_HOSTED", "/setup/time-off"],
  ["DONE", "SELF_HOSTED", "/people"],
  ["COMPANY", "MANAGED", "/setup/company"],
  ["IMPORT", "MANAGED", "/setup/import"],
  ["READY", "MANAGED", "/setup/time-off"],
  ["DONE", "MANAGED", "/people"],
] as const)("enters %s in %s through %s", (step, mode, expected) => {
  expect(setupStepPage(step, { mode, hasOwner: mode === "MANAGED" })).toBe(expected);
});

it.each([
  ["company", "SELF_HOSTED", undefined],
  ["ai", "SELF_HOSTED", "/setup/company"],
  ["import", "SELF_HOSTED", "/setup/ai"],
  ["review", "SELF_HOSTED", "/setup/import"],
  ["timeOff", "SELF_HOSTED", undefined],
  ["who", "SELF_HOSTED", "/setup/time-off"],
  ["owner", "SELF_HOSTED", "/setup/who"],
  ["company", "MANAGED", undefined],
  ["import", "MANAGED", "/setup/company"],
  ["review", "MANAGED", "/setup/import"],
  ["timeOff", "MANAGED", undefined],
  ["who", "MANAGED", "/setup/time-off"],
  ["ready", "MANAGED", "/setup/who"],
] as const)("gives %s in %s the Back destination %s", (page, mode, expected) => {
  expect(previousPage(page, { mode, hasOwner: mode === "MANAGED" })).toBe(expected);
});

it.each([
  ["company", "SELF_HOSTED", "/setup/ai"],
  ["ai", "SELF_HOSTED", "/setup/import"],
  ["import", "SELF_HOSTED", "/setup/import/review"],
  ["review", "SELF_HOSTED", "/setup/time-off"],
  ["timeOff", "SELF_HOSTED", "/setup/who"],
  ["who", "SELF_HOSTED", "/setup"],
  ["owner", "SELF_HOSTED", "/people"],
  ["company", "MANAGED", "/setup/import"],
  ["import", "MANAGED", "/setup/import/review"],
  ["review", "MANAGED", "/setup/time-off"],
  ["timeOff", "MANAGED", "/setup/who"],
  ["who", "MANAGED", "/setup/ready"],
  ["ready", "MANAGED", "/people"],
] as const)("continues from %s in %s to %s", (page, mode, expected) => {
  expect(nextPage(page, { mode, hasOwner: mode === "MANAGED" })).toBe(expected);
});

it.each([
  ["company", "/setup/ai"],
  ["review", "/setup/time-off"],
  ["timeOff", "/setup/who"],
  ["who", "/setup/ready"],
  ["ready", "/people"],
] as const)("continues from %s after reset to %s", (page, destination) => {
  expect(nextPage(page, { mode: "SELF_HOSTED", hasOwner: true })).toBe(destination);
});

it("shows setup confirmation instead of account creation after reset", () => {
  const steps = stepViews("ready", { mode: "SELF_HOSTED", hasOwner: true });

  expect(steps.map(({ id }) => id)).toEqual(["company", "ai", "people", "timeOff", "who", "ready"]);
  expect(previousPage("ready", { mode: "SELF_HOSTED", hasOwner: true })).toBe("/setup/who");
});

it("sends a signed-out visitor without setup to login with their destination", () => {
  const href = "/setup/import?source=slack";
  let caught: unknown;

  try {
    requireSetupPage("import", {
      context: {
        me: null,
        holdsSetup: false,
        setupStep: "COMPANY",
        setupFlow: { mode: "SELF_HOSTED", hasOwner: false },
      },
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

it.each([
  ["company", "COMPANY", "SELF_HOSTED", null, true],
  ["company", "IMPORT", "SELF_HOSTED", null, true],
  ["ai", "IMPORT", "SELF_HOSTED", null, true],
  ["import", "IMPORT", "SELF_HOSTED", null, true],
  ["review", "IMPORT", "SELF_HOSTED", null, true],
  ["timeOff", "OWNER", "SELF_HOSTED", null, true],
  ["who", "OWNER", "SELF_HOSTED", null, true],
  ["owner", "OWNER", "SELF_HOSTED", null, true],
  ["timeOff", "READY", "SELF_HOSTED", { id: "owner" }, false],
  ["who", "READY", "SELF_HOSTED", { id: "owner" }, false],
  ["ready", "READY", "SELF_HOSTED", { id: "owner" }, false],
  ["company", "COMPANY", "MANAGED", { id: "owner" }, false],
  ["company", "IMPORT", "MANAGED", { id: "owner" }, false],
  ["import", "IMPORT", "MANAGED", { id: "owner" }, false],
  ["review", "IMPORT", "MANAGED", { id: "owner" }, false],
  ["timeOff", "READY", "MANAGED", { id: "owner" }, false],
  ["who", "READY", "MANAGED", { id: "owner" }, false],
  ["ready", "READY", "MANAGED", { id: "owner" }, false],
] as const)(
  "opens %s at %s in %s for an authorized visitor",
  (page, setupStep, mode, me, holdsSetup) => {
    const result = requireSetupPage(page, {
      context: { me, holdsSetup, setupStep, setupFlow: { mode, hasOwner: !!me } },
      location: { href: "/setup" },
    });

    expect(result).toBeUndefined();
  },
);

it.each([
  ["ai", "IMPORT", "MANAGED", { id: "owner" }, false, "/setup/import"],
  ["company", "DONE", "SELF_HOSTED", { id: "owner" }, false, "/people"],
  ["import", "DONE", "SELF_HOSTED", { id: "owner" }, false, "/people"],
  ["import", "OWNER", "SELF_HOSTED", null, true, "/setup/time-off"],
  ["company", "READY", "SELF_HOSTED", { id: "owner" }, false, "/setup/time-off"],
] as const)(
  "sends a visitor opening %s at %s in %s to the current setup page",
  (page, setupStep, mode, me, holdsSetup, to) => {
    let caught: unknown;

    try {
      requireSetupPage(page, {
        context: { me, holdsSetup, setupStep, setupFlow: { mode, hasOwner: !!me } },
        location: { href: "/setup" },
      });
    } catch (error) {
      caught = error;
    }

    assert(isRedirect(caught));
    expect(caught.options).toMatchObject({ to, replace: true });
  },
);

it("returns the signed-in user when setup is done", () => {
  const me = { id: "owner" };

  const result = requireFinishedSetup({
    context: {
      me,
      holdsSetup: false,
      setupStep: "DONE",
      setupFlow: { mode: "SELF_HOSTED", hasOwner: true },
    },
    location: { href: "/people" },
  });

  expect(result).toBe(me);
});

it.each([
  ["COMPANY", "SELF_HOSTED", "/setup/company"],
  ["IMPORT", "SELF_HOSTED", "/setup/ai"],
  ["READY", "SELF_HOSTED", "/setup/time-off"],
  ["IMPORT", "MANAGED", "/setup/import"],
  ["READY", "MANAGED", "/setup/time-off"],
] as const)(
  "sends a signed-in user at %s in %s to %s before entering the app",
  (setupStep, mode, to) => {
    let caught: unknown;

    try {
      requireFinishedSetup({
        context: {
          me: { id: "owner" },
          holdsSetup: false,
          setupStep,
          setupFlow: { mode, hasOwner: true },
        },
        location: { href: "/people" },
      });
    } catch (error) {
      caught = error;
    }

    assert(isRedirect(caught));
    expect(caught.options).toMatchObject({ to, replace: true });
  },
);

it.each([
  ["COMPANY", false],
  ["DONE", false],
  ["DONE", true],
] as const)("sends a signed-out user at %s to login with holder %s", (setupStep, holdsSetup) => {
  const href = "/people?search=alex";
  let caught: unknown;

  try {
    requireFinishedSetup({
      context: {
        me: null,
        holdsSetup,
        setupStep,
        setupFlow: { mode: "SELF_HOSTED", hasOwner: false },
      },
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

it.each([
  ["company", "MANAGED", ["current", "later", "later", "later", "later"], ["later", "later"]],
  ["import", "MANAGED", ["done", "current", "later", "later", "later"], ["current", "later"]],
  ["review", "MANAGED", ["done", "current", "later", "later", "later"], ["done", "current"]],
  ["ready", "MANAGED", ["done", "done", "done", "done", "current"], ["done", "done"]],
  [
    "review",
    "SELF_HOSTED",
    ["done", "done", "current", "later", "later", "later"],
    ["done", "current"],
  ],
  ["owner", "SELF_HOSTED", ["done", "done", "done", "done", "done", "current"], ["done", "done"]],
  [
    "ai",
    "SELF_HOSTED",
    ["done", "current", "later", "later", "later", "later"],
    ["later", "later"],
  ],
  [
    "import",
    "SELF_HOSTED",
    ["done", "done", "current", "later", "later", "later"],
    ["current", "later"],
  ],
] as const)(
  "marks the steps and People pages while on %s in %s",
  (page, mode, states, peopleStates) => {
    const steps = stepViews(page, { mode, hasOwner: mode === "MANAGED" });

    expect(steps.map(({ id }) => id)).toEqual(
      mode === "SELF_HOSTED"
        ? ["company", "ai", "people", "timeOff", "who", "owner"]
        : ["company", "people", "timeOff", "who", "ready"],
    );
    expect(steps.map(({ state }) => state)).toEqual(states);
    const people = steps.find(({ id }) => id === "people")!;
    expect(people.pages.map(({ id }) => id)).toEqual(["import", "review"]);
    expect(people.pages.map(({ state }) => state)).toEqual(peopleStates);
  },
);

it.each(["SELF_HOSTED", "MANAGED"] as const)(
  "gives Time off and Who their own steps in %s",
  (mode) => {
    const timeOff = stepViews("timeOff", { mode, hasOwner: mode === "MANAGED" });
    expect(timeOff.map(({ id }) => id)).toEqual(
      mode === "SELF_HOSTED"
        ? ["company", "ai", "people", "timeOff", "who", "owner"]
        : ["company", "people", "timeOff", "who", "ready"],
    );
    expect(timeOff.find(({ id }) => id === "people")).toMatchObject({ state: "done" });
    expect(timeOff.find(({ id }) => id === "timeOff")).toMatchObject({
      id: "timeOff",
      state: "current",
      pages: [],
    });
    expect(timeOff.find(({ id }) => id === "who")).toMatchObject({
      id: "who",
      state: "later",
      pages: [],
    });

    const who = stepViews("who", { mode, hasOwner: mode === "MANAGED" });
    expect(who.find(({ id }) => id === "timeOff")).toMatchObject({
      id: "timeOff",
      state: "done",
      pages: [],
    });
    expect(who.find(({ id }) => id === "who")).toMatchObject({
      id: "who",
      state: "current",
      pages: [],
    });
  },
);
