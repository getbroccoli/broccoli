import type { EmailTemplate } from "../../../integrations/mail";
import type { TaskEmailContext } from "./taskEmailContext";
import { type CalendarDate, formatShortDay } from "../../../utils";

/** What the email to a task's assignee says. */
export interface TaskAssignedValues {
  taskId: string;
  title: string;
  description: string | null;
  dueDate: CalendarDate | null;
  /** The person who asked; null for a task a process gave. */
  askedByName: string | null;
}

export const TASK_ASSIGNED_TEMPLATE: EmailTemplate<TaskAssignedValues & TaskEmailContext> = {
  name: "task_assigned",
  render: ({
    taskId,
    title,
    description,
    dueDate,
    askedByName,
    recipientEmail,
    linkOrigin,
    companyName,
  }) => {
    const link = `${linkOrigin}/tasks/${taskId}`;
    return {
      subject: askedByName ? `${askedByName} asked you: ${title}` : `New task: ${title}`,
      blocks: [
        { type: "company", name: companyName },
        { type: "heading", text: title },
        ...(description ? [{ type: "paragraph" as const, text: description }] : []),
        ...(dueDate
          ? [{ type: "paragraph" as const, text: `Due ${formatShortDay(dueDate)}` }]
          : []),
        {
          type: "button",
          label: "Open task",
          link,
          hint: "It opens in Broccoli once you sign in.",
        },
        { type: "pasteLink", link },
      ],
      footer: `Sent to ${recipientEmail} because this task is yours.`,
    };
  },
};
