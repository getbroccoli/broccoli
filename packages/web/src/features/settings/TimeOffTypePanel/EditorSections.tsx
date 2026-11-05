import { Plus } from "@phosphor-icons/react";

import type { TimeOffTypePanel_TypeFragment } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RecordHistory } from "@/features/records";
import { t } from "@/i18n";

import { Hint, Row } from "./PanelParts";
import { PolicyFields } from "./PolicyFields";
import { TIME_OFF_TYPE_DESCRIPTION } from "./timeOffTypeDescription";
import type { useTimeOffTypeDraft } from "./useTimeOffTypeDraft";

type SectionProps = {
  type: TimeOffTypePanel_TypeFragment;
  edit: ReturnType<typeof useTimeOffTypeDraft>;
};

/** The type's own fields: its name and whether colleagues see the reason. */
export function TypeSection({ type, edit }: SectionProps) {
  const { draft, fieldErrors, saving } = edit;
  return (
    <section aria-labelledby="time-off-type-fields" className="flex flex-col gap-4">
      <h2 id="time-off-type-fields" className="text-[15px] font-semibold">
        {t("settings.timeOffType.typeSection")}
      </h2>
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-[13rem_minmax(0,1fr)]">
        <Row
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
        </Row>
        <Row label={t("settings.timeOffType.showReason")} htmlFor="time-off-type-reason">
          <Switch
            id="time-off-type-reason"
            checked={draft.reasonVisibleToColleagues && !type.reasonAlwaysPrivate}
            disabled={saving || type.reasonAlwaysPrivate}
            onCheckedChange={(checked) => edit.editType({ reasonVisibleToColleagues: checked })}
          />
          <Hint>{reasonHint(type, draft.name, draft.reasonVisibleToColleagues)}</Hint>
        </Row>
      </div>
    </section>
  );
}

/** The type's policies, always open: its Rules when it has one, else one block per policy. */
export function PoliciesSection({ type, edit }: SectionProps) {
  const { draft, saved, fieldErrors, saving } = edit;
  const policies = draft.policies.filter(({ deleted }) => !deleted);
  const only = policies.length === 1;
  return (
    <section
      aria-labelledby="time-off-type-policies"
      className="flex flex-col gap-3.5 border-t border-border pt-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="time-off-type-policies" className="text-[15px] font-semibold">
          {t(only ? "settings.timeOffType.rulesSection" : "settings.timeOffType.policiesSection")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {only
            ? t("settings.timeOffType.rulesHint", { name: saved.name })
            : t("settings.timeOffType.policiesHint", { name: saved.name })}
        </p>
      </div>
      {policies.map((policy) => (
        <PolicyFields
          key={policy.key}
          policy={policy}
          saved={saved.policies.find(({ key }) => key === policy.key) ?? null}
          summary={type.policies.find(({ id }) => id === policy.id) ?? null}
          only={only}
          errors={fieldErrors}
          disabled={saving}
          onEdit={(fields) => edit.editPolicy(policy.key, fields)}
          onRemove={() => edit.removePolicy(policy.key)}
        />
      ))}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3">
        <p className="min-w-0 flex-[1_1_16rem] text-sm text-muted-foreground">
          {t("settings.timeOffType.addPolicyHint")}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={edit.addPolicy}
        >
          <Plus /> {t("settings.timeOffType.addPolicy")}
        </Button>
      </div>
    </section>
  );
}

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

function reasonHint(type: TimeOffTypePanel_TypeFragment, name: string, visible: boolean): string {
  if (type.reasonAlwaysPrivate) return t("settings.timeOffType.reasonPrivateByLaw");
  return visible
    ? t("settings.timeOffType.reasonShown", { name })
    : t("settings.timeOffType.reasonHidden");
}
