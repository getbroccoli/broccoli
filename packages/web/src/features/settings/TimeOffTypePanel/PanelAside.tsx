import { RecordHistory } from "@/features/records";
import { t } from "@/i18n";

import { TIME_OFF_TYPE_DESCRIPTION } from "./timeOffTypeDescription";

/** What saving changes, coming soon, and the type's history. */
export function PanelAside({ timeOffTypeId }: { timeOffTypeId: string }) {
  return (
    <aside
      aria-label={t("settings.timeOffType.asideLabel")}
      className="flex min-w-0 flex-[1_1_18rem] flex-col gap-6 border-l border-border bg-muted/30 px-6 py-6"
    >
      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border bg-card/60 p-4">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
            {t("settings.timeOffType.whatChanges")}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {t("settings.timeOffType.comingSoon")}
          </span>
        </span>
        <p className="text-sm text-muted-foreground">{t("settings.timeOffType.whatChangesSoon")}</p>
      </div>
      <RecordHistory
        recordType="TIME_OFF_TYPE"
        recordId={timeOffTypeId}
        description={TIME_OFF_TYPE_DESCRIPTION}
      />
    </aside>
  );
}
