import type { RecordDescription } from "@/features/records";
import { t } from "@/i18n";

/** A task's fields as its history shows them; a status change reads as what was done. */
export const TASK_DESCRIPTION: RecordDescription = {
  titleField: "title",
  createdAs: { EDITED_DIRECTLY: "tasks.history.created" },
  changedAs: ({ field, newValue }) => (field === "status" ? statusChangeSentence(newValue) : null),
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

/** "marked it done" or "cancelled it". */
function statusChangeSentence(newValue: string | null): string | null {
  if (newValue === "done") return t("tasks.history.markedDone");
  if (newValue === "cancelled") return t("tasks.history.cancelled");
  return null;
}

const STATUS_LABELS: Partial<Record<string, string>> = {
  to_do: t("tasks.status.TO_DO"),
  done: t("tasks.status.DONE"),
  cancelled: t("tasks.status.CANCELLED"),
};
