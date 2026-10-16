import { t } from "@/i18n";

/** What Approve leaves out or uses unchecked, or that no one is ready; nothing when all is settled. */
export function ApproveNote({
  readyCount,
  leftOutCount,
  incompleteCount,
  uncheckedCount,
}: {
  readyCount: number;
  leftOutCount: number;
  incompleteCount: number;
  uncheckedCount: number;
}) {
  if (readyCount === 0) {
    return <p className="text-sm text-muted-foreground">{t("setup.review.noneReady")}</p>;
  }
  const lines = [
    leftOutCount > 0 && t("setup.review.leftOutCount", { count: String(leftOutCount) }),
    incompleteCount > 0 &&
      (incompleteCount === 1
        ? t("setup.review.incompleteOne")
        : t("setup.review.incomplete", { count: String(incompleteCount) })),
    uncheckedCount > 0 &&
      (uncheckedCount === 1
        ? t("setup.review.uncheckedOne")
        : t("setup.review.unchecked", { count: String(uncheckedCount) })),
  ].filter(Boolean);
  if (lines.length === 0) {
    return null;
  }
  return <p className="text-sm text-muted-foreground">{lines.join(" ")}</p>;
}
