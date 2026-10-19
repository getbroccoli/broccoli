import { expect, it } from "vitest";

import { stepViews } from "./setupSteps";

it("marks owner done and people later while company is current", () => {
  const steps = stepViews("company", "MANAGED");

  expect(steps).toMatchObject([
    { id: "owner", state: "done" },
    { id: "company", state: "current" },
    {
      id: "people",
      state: "later",
      pages: [
        { id: "import", state: "later" },
        { id: "review", state: "later" },
      ],
    },
  ]);
});

it("marks people current and earlier steps done while importing", () => {
  const steps = stepViews("import", "MANAGED");

  expect(steps).toMatchObject([
    { id: "owner", state: "done" },
    { id: "company", state: "done" },
    {
      id: "people",
      state: "current",
      pages: [
        { id: "import", state: "current" },
        { id: "review", state: "later" },
      ],
    },
  ]);
});

it("keeps people current with import done while reviewing", () => {
  const steps = stepViews("review", "MANAGED");

  expect(steps).toMatchObject([
    { id: "owner", state: "done" },
    { id: "company", state: "done" },
    {
      id: "people",
      state: "current",
      pages: [
        { id: "import", state: "done" },
        { id: "review", state: "current" },
      ],
    },
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
