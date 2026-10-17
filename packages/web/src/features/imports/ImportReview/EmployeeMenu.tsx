import { DotsThree } from "@phosphor-icons/react";
import { toast } from "sonner";

import { SetEmployeeLeftOutDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";

import { useRefreshReview } from "./useRefreshReview";

/** A row's options: leave the import employee out of Approve, or add it back. */
export function EmployeeMenu({
  employeeId,
  employeeName,
  leftOut,
}: {
  employeeId: string;
  employeeName: string;
  leftOut: boolean;
}) {
  const refreshReview = useRefreshReview();
  const [setLeftOut, { loading }] = usePayloadMutation(SetEmployeeLeftOutDocument);

  const toggle = async () => {
    try {
      await setLeftOut({ variables: { employeeId, leftOut: !leftOut } });
    } catch {
      toast.error(t("setup.review.saveFailed"));
      return;
    }
    await refreshReview();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full"
            disabled={loading}
            aria-label={t("setup.review.menu", { name: employeeName })}
          />
        }
      >
        <DotsThree size={22} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        <DropdownMenuItem onClick={() => void toggle()}>
          {leftOut ? t("setup.review.addBack") : t("setup.review.leaveOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
