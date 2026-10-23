import { t } from "@/i18n";

import { ChangeValues } from "./ChangeValues";
import type { Summary } from "./historyLines";

type Props = {
  summary: Summary;
};

/** What a history line changed, as the sentence after its author. */
export function SummaryText({ summary }: Props) {
  switch (summary.kind) {
    case "changed":
      if (summary.newValue === null) {
        return <>{t("records.history.cleared", { field: lower(summary.label) })}</>;
      }
      return (
        <>
          {summary.oldValue === null
            ? t("records.history.set", { field: lower(summary.label) })
            : t("records.history.changed", { field: lower(summary.label) })}{" "}
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

/** "Job title" as "job title", inside a sentence. */
function lower(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}
