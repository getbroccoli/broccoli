import { ArrowLeft } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import type { SetupInviteSearch } from "@/features/setup";
import { t } from "@/i18n";

type Props = {
  search: SetupInviteSearch;
};

/** "Back" on setup's last page: to "Who uses Broccoli", keeping what the owner chose there. */
export function BackToWho({ search }: Props) {
  const navigate = useNavigate();
  return (
    <Button
      type="button"
      variant="ghost"
      size="lg"
      className="h-10 gap-2 px-3"
      onClick={() => void navigate({ to: "/setup/who", search })}
    >
      <ArrowLeft aria-hidden />
      {t("setup.back")}
    </Button>
  );
}
