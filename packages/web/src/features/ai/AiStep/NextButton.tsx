import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

type Props = {
  checking: boolean;
  disabled: boolean;
};

export function NextButton({ checking, disabled }: Props) {
  return (
    <Button type="submit" size="lg" className="h-10 px-4" disabled={disabled}>
      {t(checking ? "setup.ai.checking" : "setup.ai.next")}
    </Button>
  );
}
