import type { RecordDescription } from "@/features/records";
import { t } from "@/i18n";

/** A task's fields as its history shows them; a status change reads as what was done. */
export const TASK_DESCRIPTION: RecordDescription = {
  titleField: "title",
  createdAs: { EDITED_DIRECTLY: "tasks.history.created" },
  changedAs: ({ field, oldValue, newValue }) =>
    field === "status" ? statusChangeSentence(oldValue, newValue) : null,
  fields: [
    {
      key: "title",
      label: t("tasks.history.title"),
      editor: "text",
      format: (value) => value,
      historyOnly: true,
    },
    {
      key: "status",
      label: t("tasks.history.status"),
      editor: "text",
      format: (value) => STATUS_LABELS[value] ?? value,
      historyOnly: true,
    },
  ],
};

/** "marked it done", "reopened it", "cancelled it", "put it on hold" or "took it off hold". */
function statusChangeSentence(oldValue: string | null, newValue: string | null): string | null {
  if (newValue === "done") return t("tasks.history.markedDone");
  if (newValue === "cancelled") return t("tasks.history.cancelled");
  if (newValue === "waiting") return t("tasks.history.waiting");
  if (newValue === "to_do" && oldValue === "done") return t("tasks.history.reopened");
  if (newValue === "to_do" && oldValue === "waiting") return t("tasks.history.offHold");
  return null;
}

const STATUS_LABELS: Partial<Record<string, string>> = {
  to_do: t("tasks.status.TO_DO"),
  waiting: t("tasks.status.WAITING"),
  done: t("tasks.status.DONE"),
  cancelled: t("tasks.status.CANCELLED"),
};
