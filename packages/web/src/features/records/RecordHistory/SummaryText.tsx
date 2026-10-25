import { type MessageKey, t } from "@/i18n";

import { ChangeValues } from "./ChangeValues";
import type { Summary } from "./historyLines";

type Props = {
  summary: Summary;
};

/** What a history line changed, as the sentence after its author. */
export function SummaryText({ summary }: Props) {
  switch (summary.kind) {
    case "changed":
      return (
        <>
          {t(changeVerb(summary), { field: lower(summary.label) })}{" "}
          <ChangeValues oldValue={summary.oldValue} newValue={summary.newValue} />
        </>
      );
    case "updatedMany":
      return (
        <>
          {t("records.history.updatedMany", { count: String(summary.labels.length) })}{" "}
          <span className="text-muted-foreground">{summary.labels.join(", ")}</span>
        </>
      );
    case "created":
      return (
        <>
          {summary.title
            ? t("records.history.created", {
                title: summary.title,
                count: String(summary.labels.length),
              })
            : t("records.history.createdUntitled", { count: String(summary.labels.length) })}{" "}
          <span className="text-muted-foreground">{summary.labels.join(", ")}</span>
        </>
      );
    case "deleted":
      return (
        <>
          {summary.title
            ? t("records.history.deleted", { title: summary.title })
            : t("records.history.deletedUntitled")}
        </>
      );
  }
}

function changeVerb({ oldValue, newValue }: Extract<Summary, { kind: "changed" }>): MessageKey {
  if (newValue === null) return "records.history.cleared";
  return oldValue === null ? "records.history.set" : "records.history.changed";
}

/** "Job title" as "job title", inside a sentence. */
function lower(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}
