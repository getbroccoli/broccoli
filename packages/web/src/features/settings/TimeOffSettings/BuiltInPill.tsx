import { t } from "@/i18n";

/** Marks Annual leave, Sickness, Family leave and Other, which Broccoli treats specially. */
export function BuiltInPill() {
  return (
    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {t("settings.timeOff.builtIn")}
    </span>
  );
}
