import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import type { DocumentNode } from "graphql";

import { CreateTimeOffTypeDocument, type CreateTimeOffTypeMutation } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "@/i18n";

import { nameErrorOf } from "./nameError";
import { daysError } from "@/features/termsDisplay";
import { typeInputOf } from "./timeOffRules";
import { TimeOffTypeFields, type TimeOffTypeValues } from "./TimeOffTypeFields";

type Props = {
  /** The shown queries listing types; lists are ordered by name on the server, so they reload. */
  refetch: DocumentNode[];
  onClose: () => void;
  /** Called with the new type once the lists showing it have reloaded. */
  onAdded?: (
    timeOffType: NonNullable<CreateTimeOffTypeMutation["timeOff"]["createType"]["timeOffType"]>,
  ) => void;
};

/** A new type starts with the default look, colleagues see its name, and it doesn't count. */
const NEW_TYPE: TimeOffTypeValues = {
  name: "",
  icon: "SUN",
  colour: "YELLOW",
  private: false,
  defaultRules: { balance: "NO_BALANCE", days: "", onTop: true },
};

/** Adds a time off type for the whole company; no terms offer it yet. */
export function AddTimeOffTypeDialog({ refetch, onClose, onAdded }: Props) {
  const [values, setValues] = useState(NEW_TYPE);
  const [createType, { loading, error, payloadError }] = usePayloadMutation(
    CreateTimeOffTypeDocument,
    { refetch },
  );
  const trimmed = values.name.trim();
  const nameError = nameErrorOf(payloadError);
  const failed = !nameError && (error || payloadError);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const { timeOffType } = await createType({ variables: { input: typeInputOf(values) } });
      toast(t("settings.timeOff.added", { name: timeOffType?.name ?? trimmed }));
      onClose();
      if (timeOffType) onAdded?.(timeOffType);
    } catch {
      // The form shows the failure.
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent
        // A short or zoomed screen scrolls the form rather than cutting off its actions.
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
        closeLabel={t("settings.timeOff.close")}
      >
        <form onSubmit={(event) => void save(event)} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t("settings.timeOff.addTitle")}</DialogTitle>
            <DialogDescription>{t("settings.timeOff.addHint")}</DialogDescription>
          </DialogHeader>
          <TimeOffTypeFields
            values={values}
            onChange={setValues}
            sickness={false}
            nameError={nameError}
          />
          {failed && (
            <p role="alert" className="text-sm text-destructive">
              {t("settings.timeOff.saveFailed")}
            </p>
          )}
          <DialogFooter className="sm:items-center">
            <p className="text-sm text-muted-foreground sm:mr-auto">
              {trimmed
                ? t("settings.timeOff.addsNamed", { name: trimmed })
                : t("settings.timeOff.adds")}
            </p>
            <Button type="button" variant="ghost" disabled={loading} onClick={onClose}>
              {t("settings.timeOff.cancel")}
            </Button>
            <Button type="submit" disabled={loading || Boolean(daysError(values.defaultRules))}>
              {t("settings.timeOff.add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
