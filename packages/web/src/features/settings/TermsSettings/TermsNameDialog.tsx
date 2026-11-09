import { useQuery } from "@apollo/client/react";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

import {
  CloneTermsDocument,
  EmploymentTermsDocument,
  RecordHistoryDocument,
  RenameTermsDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "@/i18n";

import { nameError } from "./termsNameText";
import { TermsNameField } from "./TermsNameField";

type Props = {
  /** Rename the terms, or clone them into new terms under the name. */
  action: "rename" | "clone";
  onClose: () => void;
  terms: { id: string; name: string };
};

/**
 * Asks for a name: renaming shows it in the stack's header and the list; cloning opens the new
 * terms, which start with these terms' week and time off rules.
 */
export function TermsNameDialog({ action, onClose, terms }: Props) {
  const navigate = useNavigate();
  const [name, setName] = useState(
    action === "clone" ? t("terms.clone.name", { name: terms.name }) : terms.name,
  );
  // The list under the stack already holds every name, to say which terms a taken name belongs to.
  const { data } = useQuery(EmploymentTermsDocument, { fetchPolicy: "cache-only" });
  // The list orders by name, and the open history gains the rename's line.
  const [renameTerms, renaming] = usePayloadMutation(RenameTermsDocument, {
    refetch: [EmploymentTermsDocument, RecordHistoryDocument],
  });
  const [cloneTerms, cloning] = usePayloadMutation(CloneTermsDocument, {
    refetch: [EmploymentTermsDocument],
  });
  const saving = action === "clone" ? cloning : renaming;
  const failed = Boolean(saving.payloadError || saving.error);
  const refusal = saving.payloadError;
  const code =
    refusal?.__typename === "InvalidInputError"
      ? refusal.fields.find(({ field }) => field === "name")?.code
      : undefined;
  const termsNames = (data?.allTerms ?? []).map((other) => other.name);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (action === "rename") {
      const renamed = await renameTerms({ variables: { input: { id: terms.id, name } } }).catch(
        () => null,
      );
      if (renamed?.terms) onClose();
      return;
    }
    const cloned = await cloneTerms({
      variables: { input: { recordType: "TERMS", id: terms.id, name } },
    }).catch(() => null);
    if (!cloned?.clone) return;
    onClose();
    void navigate({ to: "/settings/terms/$termsId", params: { termsId: cloned.clone.id } });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving.loading && onClose()}>
      <DialogContent className="sm:max-w-lg" closeLabel={t("terms.close")}>
        <form onSubmit={(event) => void save(event)} className="flex flex-col gap-5">
          <DialogTitle className="text-lg">{t(`terms.${action}.title`)}</DialogTitle>
          <TermsNameField
            value={name}
            onChange={setName}
            error={failed ? nameError(code, name, termsNames) : null}
          />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {t("terms.cancel")}
            </DialogClose>
            <Button type="submit" disabled={saving.loading}>
              {t(`terms.${action}.save`)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
