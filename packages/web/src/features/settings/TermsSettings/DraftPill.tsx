import { t } from "@/i18n";

/** Marks a working week or rules saved and not published yet, and terms that have some. */
export function DraftPill() {
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
      {t("terms.draft")}
    </span>
  );
}
