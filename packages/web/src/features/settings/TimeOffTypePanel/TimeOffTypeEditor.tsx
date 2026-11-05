import { DotsThree, X } from "@phosphor-icons/react";
import { useBlocker } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import type { TimeOffTypePanel_TypeFragment } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SheetClose, SheetTitle } from "@/components/ui/sheet";
import { DiscardChangesDialog } from "@/features/records";
import { t } from "@/i18n";

import { DeleteTimeOffTypeDialog } from "./DeleteTimeOffTypeDialog";
import { PanelAside } from "./PanelAside";
import { PoliciesSection } from "./PoliciesSection";
import { TypeSection } from "./TypeSection";
import { IconPicker } from "./IconPicker";
import { grantChanged } from "./timeOffTypeDraft";
import { useTimeOffTypeDraft } from "./useTimeOffTypeDraft";

type Props = {
  type: TimeOffTypePanel_TypeFragment;
  /** A policy to scroll to when the panel opens, from a policy row in the list. */
  focusPolicyId: string | null;
  onClose: () => void;
};

/**
 * One time off type in its panel: its own fields, then its policies always open, with one Save for
 * all of it. Leaving with unsaved changes asks first.
 */
export function TimeOffTypeEditor({ type, focusPolicyId, onClose }: Props) {
  const edit = useTimeOffTypeDraft(type);
  const { draft, saved, saving } = edit;
  const [deleting, setDeleting] = useState(false);
  const blocker = useBlocker({
    shouldBlockFn: () => edit.changes > 0,
    enableBeforeUnload: () => edit.changes > 0,
    withResolver: true,
  });
  useEffect(() => {
    if (focusPolicyId) document.getElementById(`policy-${focusPolicyId}`)?.scrollIntoView();
  }, [focusPolicyId]);

  return (
    <>
      <header className="flex items-center gap-4 border-b border-border px-6 py-5">
        <IconPicker
          icon={draft.icon}
          colour={draft.colour}
          disabled={saving}
          onChange={(look) => edit.editType(look)}
        />
        <div className="min-w-0 flex-1">
          <SheetTitle className="text-xl [overflow-wrap:anywhere]">
            {draft.name || saved.name}
          </SheetTitle>
          <p className="text-sm text-muted-foreground">{subtitle(type)}</p>
        </div>
        {type.canDelete && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" aria-label={t("settings.timeOffType.more")} />
              }
            >
              <DotsThree weight="bold" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto">
              <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
                {t("settings.timeOffType.deleteType")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <SheetClose
          render={
            <Button variant="ghost" size="icon" aria-label={t("settings.timeOffType.close")} />
          }
        >
          <X />
        </SheetClose>
      </header>

      <div className="subtle-scrollbar flex flex-1 flex-wrap overflow-y-auto">
        <div className="flex min-w-0 flex-[2_1_30rem] flex-col gap-7 px-6 py-6">
          <TypeSection type={type} edit={edit} />

          <PoliciesSection type={type} edit={edit} />
        </div>

        <PanelAside timeOffTypeId={type.timeOffType.id} />
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t border-border px-6 py-4">
        <p role="status" className="min-w-0 flex-[1_1_18rem] text-sm text-muted-foreground">
          {edit.failure ?? footerLine(edit)}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={saving || edit.changes === 0}
          onClick={edit.cancel}
        >
          {t("settings.timeOffType.cancel")}
        </Button>
        <Button
          type="button"
          disabled={saving || edit.changes === 0}
          onClick={() => void edit.submit()}
        >
          {t("settings.timeOffType.save")}
        </Button>
      </footer>

      <DiscardChangesDialog
        open={blocker.status === "blocked"}
        count={edit.changes}
        name={saved.name}
        onDiscard={() => blocker.proceed?.()}
        onKeepEditing={() => blocker.reset?.()}
      />
      <DeleteTimeOffTypeDialog
        open={deleting}
        onOpenChange={setDeleting}
        timeOffType={type.timeOffType}
        onDeleted={onClose}
      />
    </>
  );
}

function subtitle({ policies }: TimeOffTypePanel_TypeFragment): string {
  const inUse = policies.filter(({ peopleCount }) => peopleCount > 0).length;
  const people = policies.reduce((sum, { peopleCount }) => sum + peopleCount, 0);
  return t(inUse === 1 ? "settings.timeOffType.subtitleOne" : "settings.timeOffType.subtitle", {
    count: String(inUse),
    people: String(people),
  });
}

/** What saving reaches: everyone ever on a policy whose grant changed, or only the type. */
function footerLine({ changes, draft, saved }: ReturnType<typeof useTimeOffTypeDraft>): string {
  if (changes === 0) return t("settings.timeOffType.noChanges");
  const changed = draft.policies.filter((policy) => {
    const before = saved.policies.find(({ key }) => key === policy.key);
    return before?.id && !policy.deleted && grantChanged(before, policy);
  });
  if (changed.length === 0) return t("settings.timeOffType.savesTypeOnly", { name: saved.name });
  return t("settings.timeOffType.savesAllowances", {
    policies: changed
      .map(({ key }) => saved.policies.find((policy) => policy.key === key)!.name)
      .join(", "),
  });
}
