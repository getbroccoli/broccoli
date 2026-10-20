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
  ["OWNER", "SELF_HOSTED", "/setup"],
  ["DONE", "SELF_HOSTED", "/people"],
  ["COMPANY", "MANAGED", "/setup/company"],
  ["IMPORT", "MANAGED", "/setup/import"],
  ["READY", "MANAGED", "/setup/ready"],
  ["DONE", "MANAGED", "/people"],
] as const)("enters %s in %s through %s", (step, mode, expected) => {
  expect(setupStepPage(step, mode)).toBe(expected);
});

it.each([
  ["company", "SELF_HOSTED", undefined],
  ["ai", "SELF_HOSTED", "/setup/company"],
  ["import", "SELF_HOSTED", "/setup/ai"],
  ["review", "SELF_HOSTED", "/setup/import"],
  ["owner", "SELF_HOSTED", undefined],
  ["company", "MANAGED", undefined],
  ["import", "MANAGED", undefined],
  ["review", "MANAGED", "/setup/import"],
  ["ready", "MANAGED", undefined],
] as const)("gives %s in %s the Back destination %s", (page, mode, expected) => {
  expect(previousPage(page, mode)).toBe(expected);
});

it.each([
  ["company", "SELF_HOSTED", "/setup/ai"],
  ["ai", "SELF_HOSTED", "/setup/import"],
  ["import", "SELF_HOSTED", "/setup/import/review"],
  ["review", "SELF_HOSTED", "/setup"],
  ["owner", "SELF_HOSTED", "/people"],
  ["company", "MANAGED", "/setup/import"],
  ["import", "MANAGED", "/setup/import/review"],
  ["review", "MANAGED", "/setup/ready"],
  ["ready", "MANAGED", "/people"],
] as const)("continues from %s in %s to %s", (page, mode, expected) => {
  expect(nextPage(page, mode)).toBe(expected);
});

it("sends a signed-out visitor without setup to login with their destination", () => {
  const href = "/setup/import?source=slack";
  let caught: unknown;

  try {
    requireSetupPage("import", {
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

it.each([
  ["company", "COMPANY", "SELF_HOSTED", null, true],
  ["company", "IMPORT", "SELF_HOSTED", null, true],
  ["ai", "IMPORT", "SELF_HOSTED", null, true],
  ["import", "IMPORT", "SELF_HOSTED", null, true],
  ["review", "IMPORT", "SELF_HOSTED", null, true],
  ["owner", "OWNER", "SELF_HOSTED", null, true],
  ["company", "COMPANY", "MANAGED", { id: "owner" }, false],
  ["import", "IMPORT", "MANAGED", { id: "owner" }, false],
  ["review", "IMPORT", "MANAGED", { id: "owner" }, false],
  ["ready", "READY", "MANAGED", { id: "owner" }, false],
] as const)(
  "opens %s at %s in %s for an authorized visitor",
  (page, setupStep, mode, me, holdsSetup) => {
    const result = requireSetupPage(page, {
      context: { me, holdsSetup, setupStep, mode },
      location: { href: "/setup" },
    });

    expect(result).toBeUndefined();
  },
);

it.each([
  ["company", "IMPORT", "MANAGED", null, true, "/setup/import"],
  ["ai", "IMPORT", "MANAGED", { id: "owner" }, false, "/setup/import"],
  ["company", "DONE", "SELF_HOSTED", { id: "owner" }, false, "/people"],
  ["import", "DONE", "SELF_HOSTED", { id: "owner" }, false, "/people"],
  ["import", "OWNER", "SELF_HOSTED", null, true, "/setup"],
  ["company", "OWNER", "SELF_HOSTED", { id: "owner" }, false, "/setup"],
] as const)(
  "sends a visitor opening %s at %s in %s to the current setup page",
  (page, setupStep, mode, me, holdsSetup, to) => {
    let caught: unknown;

    try {
      requireSetupPage(page, {
        context: { me, holdsSetup, setupStep, mode },
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
    context: { me, holdsSetup: false, setupStep: "DONE", mode: "SELF_HOSTED" },
    location: { href: "/people" },
  });

  expect(result).toBe(me);
});

it.each([
  ["COMPANY", "SELF_HOSTED", "/setup/company"],
  ["IMPORT", "SELF_HOSTED", "/setup/ai"],
  ["OWNER", "SELF_HOSTED", "/setup"],
  ["IMPORT", "MANAGED", "/setup/import"],
  ["READY", "MANAGED", "/setup/ready"],
] as const)(
  "sends a signed-in user at %s in %s to %s before entering the app",
  (setupStep, mode, to) => {
    let caught: unknown;

    try {
      requireFinishedSetup({
        context: { me: { id: "owner" }, holdsSetup: false, setupStep, mode },
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
      context: { me: null, holdsSetup, setupStep, mode: "SELF_HOSTED" },
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

it("marks people and ready later while company is current", () => {
  const steps = stepViews("company", "MANAGED");

  expect(steps).toMatchObject([
    { id: "company", state: "current" },
    {
      id: "people",
      state: "later",
      pages: [
        { id: "import", state: "later" },
        { id: "review", state: "later" },
      ],
    },
    { id: "ready", state: "later" },
  ]);
});

it("marks people current and earlier steps done while importing", () => {
  const steps = stepViews("import", "MANAGED");

  expect(steps).toMatchObject([
    { id: "company", state: "done" },
    {
      id: "people",
      state: "current",
      pages: [
        { id: "import", state: "current" },
        { id: "review", state: "later" },
      ],
    },
    { id: "ready", state: "later" },
  ]);
});

it("keeps people current with import done while reviewing", () => {
  const steps = stepViews("review", "MANAGED");

  expect(steps).toMatchObject([
    { id: "company", state: "done" },
    {
      id: "people",
      state: "current",
      pages: [
        { id: "import", state: "done" },
        { id: "review", state: "current" },
      ],
    },
    { id: "ready", state: "later" },
  ]);
});

it("marks company and people done while ready is current", () => {
  const steps = stepViews("ready", "MANAGED");

  expect(steps).toMatchObject([
    { id: "company", state: "done" },
    {
      id: "people",
      state: "done",
      pages: [
        { id: "import", state: "done" },
        { id: "review", state: "done" },
      ],
    },
    { id: "ready", state: "current" },
  ]);
});

it("keeps the self-hosted owner later while reviewing people", () => {
  const steps = stepViews("review", "SELF_HOSTED");

  expect(steps).toMatchObject([
    { id: "company", state: "done" },
    { id: "ai", title: "setup.ai.title", state: "done" },
    {
      id: "people",
      state: "current",
      pages: [
        { id: "import", state: "done" },
        { id: "review", state: "current" },
      ],
    },
    { id: "owner", state: "later" },
  ]);
});

it("marks company and people done while the self-hosted owner is current", () => {
  const steps = stepViews("owner", "SELF_HOSTED");

  expect(steps).toMatchObject([
    { id: "company", state: "done" },
    { id: "ai", title: "setup.ai.title", state: "done" },
    {
      id: "people",
      state: "done",
      pages: [
        { id: "import", state: "done" },
        { id: "review", state: "done" },
      ],
    },
    { id: "owner", state: "current" },
  ]);
});

it("places Setup AI between company and people on a self-hosted instance", () => {
  const steps = stepViews("ai", "SELF_HOSTED");

  expect(steps).toMatchObject([
    { id: "company", state: "done" },
    { id: "ai", title: "setup.ai.title", state: "current" },
    {
      id: "people",
      state: "later",
      pages: [
        { id: "import", state: "later" },
        { id: "review", state: "later" },
      ],
    },
    { id: "owner", state: "later" },
  ]);
});

it("marks Setup AI done while gathering people on a self-hosted instance", () => {
  const steps = stepViews("import", "SELF_HOSTED");

  expect(steps).toMatchObject([
    { id: "company", state: "done" },
    { id: "ai", title: "setup.ai.title", state: "done" },
    {
      id: "people",
      state: "current",
      pages: [
        { id: "import", state: "current" },
        { id: "review", state: "later" },
      ],
    },
    { id: "owner", state: "later" },
  ]);
});
