import { isRedirect } from "@tanstack/react-router";
import { assert, expect, it } from "vitest";

import { requireSetupStep } from "./requireSetupStep";

it("sends a signed-out visitor to login with their destination", () => {
  const href = "/setup/import?source=slack";
  let caught: unknown;

  try {
    requireSetupStep("IMPORT", {
      context: { me: null, setupStep: "COMPANY" },
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

it("sends a signed-in user at the wrong step to that step's page", () => {
  const me = { id: "owner" };
  let caught: unknown;

  try {
    requireSetupStep("DONE", {
      context: { me, setupStep: "OWNER" },
      location: { href: "/people" },
    });
  } catch (error) {
    caught = error;
  }

  assert(isRedirect(caught));
  expect(caught.options).toMatchObject({ to: "/setup", replace: true });
});

it("returns the signed-in user at the requested step", () => {
  const me = { id: "owner" };

  const result = requireSetupStep("IMPORT", {
    context: { me, setupStep: "IMPORT" },
    location: { href: "/setup/import" },
  });

  expect(result).toBe(me);
});
