import { Plus } from "@phosphor-icons/react";

import type { TimeOffTypePanel_TypeFragment } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { PolicyFields } from "./PolicyFields";
import type { useTimeOffTypeDraft } from "./useTimeOffTypeDraft";

type Props = {
  type: TimeOffTypePanel_TypeFragment;
  edit: ReturnType<typeof useTimeOffTypeDraft>;
};

/** The type's policies, always open: its Rules when it has one, else one block per policy. */
export function PoliciesSection({ type, edit }: Props) {
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
