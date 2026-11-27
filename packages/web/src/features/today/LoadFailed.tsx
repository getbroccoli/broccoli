import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

type Props = { onRetry: () => void };

/** A Today card's line when its read failed, with a retry. */
export function LoadFailed({ onRetry }: Props) {
  return (
    <p className="text-sm text-muted-foreground">
      {t("today.loadFailed")}{" "}
      <Button variant="link" className="h-auto p-0" onClick={onRetry}>
        {t("today.retry")}
      </Button>
    </p>
  );
}
