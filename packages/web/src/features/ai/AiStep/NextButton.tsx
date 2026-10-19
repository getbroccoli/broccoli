import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

export function NextButton({ checking, disabled }: { checking: boolean; disabled: boolean }) {
  return (
    <Button type="submit" size="lg" className="h-10 px-4" disabled={disabled}>
      {t(checking ? "setup.ai.checking" : "setup.ai.next")}
    </Button>
  );
}
