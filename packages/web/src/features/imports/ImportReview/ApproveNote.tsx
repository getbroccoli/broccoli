import { t } from "@/i18n";

/** Who Approve leaves out, or that no one is ready; nothing when everyone is. */
export function ApproveNote({
  readyCount,
  leftOutCount,
}: {
  readyCount: number;
  leftOutCount: number;
}) {
  if (readyCount === 0) {
    return <p className="text-sm text-muted-foreground">{t("setup.review.noneReady")}</p>;
  }
  if (leftOutCount === 0) {
    return null;
  }
  return (
    <p className="text-sm text-muted-foreground">
      {leftOutCount === 1
        ? t("setup.review.leftOutOne")
        : t("setup.review.leftOut", { count: String(leftOutCount) })}
    </p>
  );
}
