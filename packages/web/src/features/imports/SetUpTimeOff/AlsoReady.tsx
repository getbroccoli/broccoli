import { t } from "@/i18n";

const RECORD_ONLY_TYPES = ["sickness", "familyLeave", "other"] as const;

/** The record-only time off types turning time off on adds next to Annual leave. */
export function AlsoReady() {
  return (
    <section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-muted/50 px-4 py-3">
      <h2 className="text-sm font-semibold">{t("setup.timeOff.alsoReady")}</h2>
      <ul className="flex flex-wrap gap-1.5">
        {RECORD_ONLY_TYPES.map((type) => (
          <li
            key={type}
            className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[13px]"
          >
            {t(`setup.timeOff.type.${type}`)}
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-muted-foreground">
        {t("setup.timeOff.recordedWithoutBalance")}
      </p>
    </section>
  );
}
