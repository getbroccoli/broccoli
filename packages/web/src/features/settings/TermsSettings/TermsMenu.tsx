import { DotsThree } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { DeleteTermsDocument, type EmploymentTermsStackQuery } from "@/__generated__/graphql";
import { PayloadFailure, useCache, usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";

import { forgetTerms } from "../cache";
import { RenameTermsDialog } from "./RenameTermsDialog";
import { deleteReason } from "./termsText";

type Props = {
  terms: Pick<
    NonNullable<EmploymentTermsStackQuery["terms"]>,
    "id" | "name" | "deleteBlocker" | "locations"
  >;
};

/** The stack's ⋯ menu: rename always, delete only when it changes nobody's start or history. */
export function TermsMenu({ terms }: Props) {
  const [renaming, setRenaming] = useState(false);
  const navigate = useNavigate();
  const cache = useCache();
  const [deleteTerms, deletion] = usePayloadMutation(DeleteTermsDocument);

  const remove = async () => {
    try {
      await deleteTerms({ variables: { input: { id: terms.id } } });
    } catch (error) {
      // The server's sentence says why, such as someone joining meanwhile; the stack reloads to show it.
      toast(
        error instanceof PayloadFailure
          ? (error as PayloadFailure<{ message: string }>).payloadError.message
          : t("terms.delete.failed"),
      );
      forgetTerms(cache, terms.id);
      return;
    }
    toast(t("terms.delete.done", { name: terms.name }));
    // Closed first, so the open stack does not fetch the deleted terms again; the list drops them.
    await navigate({ to: "/settings/terms" });
    forgetTerms(cache, terms.id);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label={t("terms.more")} />}
        >
          <DotsThree weight="bold" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto max-w-80">
          <DropdownMenuItem onClick={() => setRenaming(true)}>{t("terms.rename")}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={terms.deleteBlocker !== null || deletion.loading}
            onClick={() => void remove()}
            className="flex-col items-start gap-0.5"
          >
            <span>{t("terms.delete", { name: terms.name })}</span>
            <small className="text-xs text-muted-foreground">
              {terms.deleteBlocker
                ? deleteReason(
                    terms.deleteBlocker,
                    terms.locations.map(({ name }) => name),
                  )
                : t("terms.delete.allowed")}
            </small>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameTermsDialog open={renaming} onOpenChange={setRenaming} terms={terms} />
    </>
  );
}
