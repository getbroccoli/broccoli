import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";

import type { SaveFailure } from "./useEmployeeDraft";

type Props = {
  /** The labels of the changed fields, in panel order. */
  changedLabels: string[];
  reason: string;
  onReasonChange: (reason: string) => void;
  saving: boolean;
  failure: SaveFailure | null;
  onCancel: () => void;
  onSave: () => void;
};

/**
 * The bar of a panel with unsaved changes: what changed, an optional reason offered by a quiet
 * link, and one Save for all of it, which makes one history line.
 */
export function EditBar({
  changedLabels,
  reason,
  onReasonChange,
  saving,
  failure,
  onCancel,
  onSave,
}: Props) {
  const [askingReason, setAskingReason] = useState(reason !== "");
  const count = changedLabels.length;

  return (
    <div
      role="region"
      aria-label={t("people.panel.bar.oneEntry")}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-foreground px-4 py-2.5 text-sm text-background shadow-lg"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {count === 1
            ? t("people.panel.bar.unsavedOne")
            : t("people.panel.bar.unsaved", { count: String(count) })}
        </p>
        <p className="truncate text-xs text-background/70">
          {changedLabels.join(", ")} · {t("people.panel.bar.oneEntry")}
        </p>
        {failure && (
          <p role="alert" className="pt-1 text-xs text-red-300">
            {t(failure === "removed" ? "people.panel.bar.removed" : "people.panel.bar.failed")}
          </p>
        )}
      </div>
      {askingReason ? (
        <Input
          autoFocus
          value={reason}
          maxLength={500}
          aria-label={t("people.panel.bar.reason")}
          placeholder={t("people.panel.bar.reason")}
          onChange={(event) => onReasonChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSave();
          }}
          className="h-8 w-56 border-background/30 text-background placeholder:text-background/60"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAskingReason(true)}
          className="text-xs text-background/70 underline-offset-2 hover:text-background hover:underline"
        >
          {t("people.panel.bar.addReason")}
        </button>
      )}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={onCancel}
          className="border-background/30 bg-transparent text-background hover:bg-background/10 hover:text-background"
        >
          {t("people.panel.bar.cancel")}
        </Button>
        <Button
          size="sm"
          disabled={saving}
          focusableWhenDisabled
          onClick={onSave}
          className="bg-background text-foreground hover:bg-background/90"
        >
          {saving ? t("people.panel.bar.saving") : t("people.panel.bar.save")}
        </Button>
      </div>
    </div>
  );
}
