import { useQuery } from "@apollo/client/react";
import { type FormEvent, useState } from "react";

import {
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

import { nameError } from "./termsText";
import { TermsNameField } from "./TermsNameField";

type Props = {
  onClose: () => void;
  terms: { id: string; name: string };
};

/** Renames terms; the stack's header and the list show the new name once saved. */
export function RenameTermsDialog({ onClose, terms }: Props) {
  const [name, setName] = useState(terms.name);
  // The list under the stack already holds every name, to say which terms a taken name belongs to.
  const { data } = useQuery(EmploymentTermsDocument, { fetchPolicy: "cache-only" });
  // The list orders by name, and the open history gains the rename's line.
  const [renameTerms, renaming] = usePayloadMutation(RenameTermsDocument, {
    refetch: [EmploymentTermsDocument, RecordHistoryDocument],
  });
  const failed = Boolean(renaming.payloadError || renaming.error);
  const refusal = renaming.payloadError;
  const code =
    refusal?.__typename === "InvalidInputError"
      ? refusal.fields.find(({ field }) => field === "name")?.code
      : undefined;
  const termsNames = (data?.allTerms ?? []).map((other) => other.name);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const renamed = await renameTerms({ variables: { input: { id: terms.id, name } } }).catch(
      () => null,
    );
    if (renamed?.terms) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !renaming.loading && onClose()}>
      <DialogContent className="sm:max-w-lg" closeLabel={t("terms.close")}>
        <form onSubmit={(event) => void save(event)} className="flex flex-col gap-5">
          <DialogTitle className="text-lg">{t("terms.rename.title")}</DialogTitle>
          <TermsNameField
            value={name}
            onChange={setName}
            error={failed ? nameError(code, name, termsNames) : null}
          />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {t("terms.cancel")}
            </DialogClose>
            <Button type="submit" disabled={renaming.loading}>
              {t("terms.rename.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
