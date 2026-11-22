import { expect, test } from "vitest";

import { parseCalendarDate } from "../../../utils";
import { TASK_ASSIGNED_TEMPLATE } from "./taskAssigned.email";

test("names the asker in the subject", () => {
  expect(TASK_ASSIGNED_TEMPLATE.render(values).subject).toBe(
    "Sam Lee asked you: Book the team offsite",
  );
});

test("announces a new task when there is no asker", () => {
  expect(
    TASK_ASSIGNED_TEMPLATE.render({
      ...values,
      askedByName: null,
      title: "Have a welcome 1:1 with Ada",
    }).subject,
  ).toBe("New task: Have a welcome 1:1 with Ada");
});

test("shows the title, description and due day", () => {
  expect(TASK_ASSIGNED_TEMPLATE.render(values).blocks).toEqual(
    expect.arrayContaining([
      { type: "heading", text: values.title },
      { type: "paragraph", text: "Choose somewhere near the station." },
      { type: "paragraph", text: "Due Fri 20 Nov" },
    ]),
  );
});

test.each([
  { description: null, dueDate: null, paragraphs: [] },
  { description: "Near the station.", dueDate: null, paragraphs: ["Near the station."] },
  { description: null, dueDate: parseCalendarDate("2026-11-20")!, paragraphs: ["Due Fri 20 Nov"] },
])(
  "shows only the paragraphs with values: $description, $dueDate",
  ({ description, dueDate, paragraphs }) => {
    const email = TASK_ASSIGNED_TEMPLATE.render({ ...values, description, dueDate });

    expect(email.blocks.filter(({ type }) => type === "paragraph")).toEqual(
      paragraphs.map((text) => ({ type: "paragraph", text })),
    );
  },
);

test("links to the task and tells the recipient why they received it", () => {
  const email = TASK_ASSIGNED_TEMPLATE.render(values);

  expect(email.blocks).toContainEqual(
    expect.objectContaining({
      type: "button",
      label: "Open task",
      link: "https://broccoli.example.com/tasks/task-1",
    }),
  );
  expect(email.footer).toBe("Sent to mia@example.com because this task is yours.");
});

const values = {
  recipientEmail: "mia@example.com",
  linkOrigin: "https://broccoli.example.com",
  companyName: "Acme Corp",
  taskId: "task-1",
  title: "Book the team offsite",
  description: "Choose somewhere near the station.",
  dueDate: parseCalendarDate("2026-11-20")!,
  askedByName: "Sam Lee",
};
