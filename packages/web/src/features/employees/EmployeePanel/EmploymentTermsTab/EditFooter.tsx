import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

type Props = {
  /** What saving does; none until it is known. */
  line: string | null;
  /** Something can be saved. */
  ready: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
};

/** The panel's footer while an edit on the Employment terms tab is open: what saving does, then Cancel and Save. */
export function EditFooter({ line, ready, saving, onCancel, onSave }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p aria-live="polite" className="min-w-48 flex-1 text-sm text-muted-foreground">
        {line}
      </p>
      <Button variant="outline" disabled={saving} onClick={onCancel}>
        {t("changeTerms.cancel")}
      </Button>
      <Button disabled={!ready || saving} onClick={onSave}>
        {t("changeTerms.save")}
      </Button>
    </div>
  );
}
