import type { TimeOffTypePanel_TypeFragment } from "@/__generated__/graphql";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { t } from "@/i18n";

import { FieldHint } from "./FieldHint";
import { FieldRow } from "./FieldRow";
import type { useTimeOffTypeDraft } from "./useTimeOffTypeDraft";

type Props = {
  type: TimeOffTypePanel_TypeFragment;
  edit: ReturnType<typeof useTimeOffTypeDraft>;
};

/** The type's own fields: its name and whether colleagues see the reason. */
export function TypeSection({ type, edit }: Props) {
  const { draft, fieldErrors, saving } = edit;
  return (
    <section aria-labelledby="time-off-type-fields" className="flex flex-col gap-4">
      <h2 id="time-off-type-fields" className="text-[15px] font-semibold">
        {t("settings.timeOffType.typeSection")}
      </h2>
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-[13rem_minmax(0,1fr)]">
        <FieldRow
          label={t("settings.timeOffType.name")}
          htmlFor="time-off-type-name"
          error={fieldErrors.name}
        >
          <Input
            id="time-off-type-name"
            value={draft.name}
            disabled={saving}
            aria-invalid={Boolean(fieldErrors.name)}
            className="max-w-80"
            onChange={(event) => edit.editType({ name: event.target.value })}
          />
        </FieldRow>
        <FieldRow label={t("settings.timeOffType.showReason")} htmlFor="time-off-type-reason">
          <Switch
            id="time-off-type-reason"
            checked={draft.reasonVisibleToColleagues && !type.reasonAlwaysPrivate}
            disabled={saving || type.reasonAlwaysPrivate}
            onCheckedChange={(checked) => edit.editType({ reasonVisibleToColleagues: checked })}
          />
          <FieldHint>{reasonHint(type, draft.name, draft.reasonVisibleToColleagues)}</FieldHint>
        </FieldRow>
      </div>
    </section>
  );
}

function reasonHint(type: TimeOffTypePanel_TypeFragment, name: string, visible: boolean): string {
  if (type.reasonAlwaysPrivate) return t("settings.timeOffType.reasonPrivateByLaw");
  return visible
    ? t("settings.timeOffType.reasonShown", { name })
    : t("settings.timeOffType.reasonHidden");
}
