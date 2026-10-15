import { t } from "@/i18n";

/** An empty value; amber when it is why Approve leaves the person out. */
export function NotSet({ missing = false }: { missing?: boolean }) {
  return (
    <span className={missing ? "text-amber-800" : "text-muted-foreground"}>
      {t("setup.review.notSet")}
    </span>
  );
}
