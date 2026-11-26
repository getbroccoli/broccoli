import { expect, it } from "vitest";

import { allowPromises } from "./allowPromises";

it("shows the promises for read-only access", () => {
  expect(allowPromises(new Set(["broccoli:read"]))).toEqual([
    "mcpAgents.allow.reads",
    "mcpAgents.allow.neverApproves",
    "mcpAgents.allow.disconnect",
  ]);
});

it("adds asking for leave when the agent requests write access", () => {
  expect(allowPromises(new Set(["broccoli:read", "broccoli:write"]))).toEqual([
    "mcpAgents.allow.reads",
    "mcpAgents.allow.asksForLeave",
    "mcpAgents.allow.neverApproves",
    "mcpAgents.allow.disconnect",
  ]);
});
