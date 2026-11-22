import type { EmailTemplate } from "../../../integrations/mail";
import type { TaskEmailContext } from "./taskEmailContext";
import { dateInLondon, formatShortDay } from "../../../utils";

/** What the email to the person who asked for a task says once it is done. */
export interface TaskDoneValues {
  taskId: string;
  title: string;
  doneByName: string;
  doneAt: Date;
}

export const TASK_DONE_TEMPLATE: EmailTemplate<TaskDoneValues & TaskEmailContext> = {
  name: "task_done",
  render: ({ taskId, title, doneByName, doneAt, recipientEmail, linkOrigin, companyName }) => {
    const link = `${linkOrigin}/tasks/${taskId}`;
    return {
      subject: `${doneByName} marked done: ${title}`,
      blocks: [
        { type: "company", name: companyName },
        { type: "heading", text: title },
        {
          type: "paragraph",
          text: `Done by ${doneByName} on ${formatShortDay(dateInLondon(doneAt))}`,
        },
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
