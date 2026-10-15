import { expect, it } from "vitest";

import { stepViews } from "./setupSteps";

it("marks owner done and people later while company is current", () => {
  const steps = stepViews("company");

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
  const steps = stepViews("import");

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
  const steps = stepViews("review");

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
