import { expect, it } from "vitest";

import { agentActivityLabel } from "./agentActivityLabel";

it.each([
  ["my_leave_balance", "Checked your leave"],
  ["preview_leave", "Worked out a leave request"],
  ["request_leave", "Asked for leave"],
  ["show_approval", "Showed you an approval"],
  ["decide_approval", "You decided on the card"],
])("describes %s in the person's activity", (tool, label) => {
  expect(agentActivityLabel({ tool })).toBe(label);
});

it("shows how many tasks the agent listed", () => {
  expect(agentActivityLabel({ tool: "list_my_tasks", resultCount: 3 })).toBe(
    "Listed your tasks · 3 found",
  );
});
