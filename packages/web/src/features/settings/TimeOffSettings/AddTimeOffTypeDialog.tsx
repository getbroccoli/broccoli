import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { CreateTimeOffTypeDocument, TimeOffSettingsDocument } from "@/__generated__/graphql";
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
import { daysError, typeInputOf } from "./timeOffRules";
import { TimeOffTypeFields, type TimeOffTypeValues } from "./TimeOffTypeFields";

type Props = {
  onClose: () => void;
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
export function AddTimeOffTypeDialog({ onClose }: Props) {
  const [values, setValues] = useState(NEW_TYPE);
  // The list is ordered by name on the server, so it reloads after adding.
  const [createType, { loading, error, payloadError }] = usePayloadMutation(
    CreateTimeOffTypeDocument,
    { refetch: [TimeOffSettingsDocument] },
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
