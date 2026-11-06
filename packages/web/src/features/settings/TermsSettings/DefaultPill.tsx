import { t } from "@/i18n";

/** Marks the default terms, which people without a location start on. */
export function DefaultPill() {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {t("terms.default")}
    </span>
  );
}
