import type { EmailTemplate } from "../../../integrations/mail";
import type { TaskEmailContext } from "./taskEmailContext";
import { dateInLondon, formatShortDay } from "../../../utils";

/** What the email to the person who asked for a task says once it is done. */
export interface TaskDoneValues {
  taskId: string;
  title: string;
  doneByName: string;
  doneAt: Date;
  /** What its assignee gave, as people read it ("Reject — Clashes with the release week."). */
  result: string | null;
}

export const TASK_DONE_TEMPLATE: EmailTemplate<TaskDoneValues & TaskEmailContext> = {
  name: "task_done",
  render: ({
    taskId,
    title,
    doneByName,
    doneAt,
    result,
    recipientEmail,
    linkOrigin,
    companyName,
  }) => {
    const link = `${linkOrigin}/tasks/${taskId}`;
    const resultLine =
      result === null ? [] : [{ type: "paragraph" as const, text: `Result: ${result}` }];
    return {
      subject: `${doneByName} marked done: ${title}`,
      blocks: [
        { type: "company", name: companyName },
        { type: "heading", text: title },
        {
          type: "paragraph",
          text: `Done by ${doneByName} on ${formatShortDay(dateInLondon(doneAt))}`,
        },
        ...resultLine,
        {
          type: "button",
          label: "Open task",
          link,
          hint: "It opens in Broccoli once you sign in.",
        },
        { type: "pasteLink", link },
      ],
      footer: `Sent to ${recipientEmail} because you asked for this task.`,
    };
  },
};
