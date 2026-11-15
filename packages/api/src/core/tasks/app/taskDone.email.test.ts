import { expect, test } from "vitest";

import { TASK_DONE_TEMPLATE } from "./taskDone.email";

test("names the person who marked the task done in the subject", () => {
  expect(TASK_DONE_TEMPLATE.render(values).subject).toBe(
    "Mia Chen marked done: Book the team offsite",
  );
});

test("shows who marked the task done and on which London day", () => {
  expect(TASK_DONE_TEMPLATE.render(values).blocks).toContainEqual({
    type: "paragraph",
    text: "Done by Mia Chen on Thu 12 Nov",
  });
});

test("uses the next London day during British Summer Time", () => {
  const email = TASK_DONE_TEMPLATE.render({ ...values, doneAt: new Date("2026-07-01T23:30:00Z") });

  expect(email.blocks).toContainEqual({ type: "paragraph", text: "Done by Mia Chen on Thu 2 Jul" });
});

test("links to the task and tells the asker why they received it", () => {
  const email = TASK_DONE_TEMPLATE.render(values);

  expect(email.blocks).toContainEqual(
    expect.objectContaining({
      type: "button",
      label: "Open task",
      link: "https://broccoli.example.com/tasks/task-1",
    }),
  );
  expect(email.footer).toBe("Sent to sam@example.com because you asked for this task.");
});

const values = {
  recipientEmail: "sam@example.com",
  linkOrigin: "https://broccoli.example.com",
  companyName: "Acme Corp",
  taskId: "task-1",
  title: "Book the team offsite",
  doneByName: "Mia Chen",
  doneAt: new Date("2026-11-12T23:30:00Z"),
};
