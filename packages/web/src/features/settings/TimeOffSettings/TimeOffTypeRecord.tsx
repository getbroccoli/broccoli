import { DotsThree, X } from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import {
  ChangeTimeOffTypeDocument,
  TimeOffSettingsDocument,
  type TimeOffSettingsQuery,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SheetClose, SheetTitle } from "@/components/ui/sheet";
import { t } from "@/i18n";

import { DeleteTimeOffTypeDialog } from "./DeleteTimeOffTypeDialog";
import { nameErrorOf } from "./nameError";
import { daysError, rulesValuesOf, typeInputOf } from "./timeOffRules";
import { TimeOffTypeFields, type TimeOffTypeValues } from "./TimeOffTypeFields";
import { TimeOffTypeIcon } from "./TimeOffTypeIcon";

type Props = {
  type: TimeOffSettingsQuery["timeOffSettings"]["timeOffTypes"][number]["timeOffType"];
  onDeleted: () => void;
};

/** One loaded time off type: header, its fields edited in place with one Save, and Delete. */
export function TimeOffTypeRecord({ type, onDeleted }: Props) {
  const saved: TimeOffTypeValues = {
    name: type.name,
    icon: type.icon,
    colour: type.colour,
    private: type.private,
    defaultRules: rulesValuesOf(type.defaultRules),
  };
  const [values, setValues] = useState(saved);
  const [deleting, setDeleting] = useState(false);
  // The list is ordered by name on the server, so it reloads after a save.
  const [changeType, { loading, error, payloadError, reset }] = usePayloadMutation(
    ChangeTimeOffTypeDocument,
    { refetch: [TimeOffSettingsDocument] },
  );
  const changed = JSON.stringify(typeInputOf(values)) !== JSON.stringify(typeInputOf(saved));
  const nameError = nameErrorOf(payloadError);
  const failed = !nameError && (error || payloadError);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const { timeOffType } = await changeType({
        variables: { input: { timeOffTypeId: type.id, ...typeInputOf(values) } },
      });
      toast(t("settings.timeOff.saved", { name: timeOffType?.name ?? values.name.trim() }));
    } catch {
      // The form shows the failure.
    }
  };

  return (
    <form onSubmit={(event) => void save(event)} className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-4 border-b border-border px-6 py-5">
        <TimeOffTypeIcon icon={type.icon} colour={type.colour} />
        <div className="min-w-0 flex-1">
          <SheetTitle className="truncate">{type.name}</SheetTitle>
          <p className="truncate text-[13px] text-muted-foreground">
            {t("settings.timeOff.editHint")}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("settings.timeOff.more")}
              />
            }
          >
            <DotsThree weight="bold" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto max-w-80">
            <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
              <span className="truncate">
                {t("settings.timeOff.delete.menu", { name: type.name })}
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <SheetClose
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("settings.timeOff.close")}
            />
          }
        >
          <X />
        </SheetClose>
      </header>

      <div className="subtle-scrollbar flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-6">
        {/* Locked while saving: the saved values replace the form when the save is back. */}
        <fieldset disabled={loading} className="flex flex-col gap-5">
          <TimeOffTypeFields
            values={values}
            onChange={setValues}
            sickness={type.typeKey === "SICKNESS"}
            nameError={nameError}
          />
        </fieldset>
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            {t("settings.timeOff.saveFailed")}
          </p>
        )}
      </div>

      <footer className="flex flex-col gap-3 border-t border-border px-6 py-3 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground sm:mr-auto">
          {t("settings.timeOff.sameEverywhere")}
        </p>
        {changed && (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={loading}
              onClick={() => {
                setValues(saved);
                reset();
              }}
            >
              {t("settings.timeOff.cancel")}
            </Button>
            <Button type="submit" disabled={loading || Boolean(daysError(values.defaultRules))}>
              {t("settings.timeOff.save")}
            </Button>
          </div>
        )}
      </footer>

      <DeleteTimeOffTypeDialog
        open={deleting}
        onOpenChange={setDeleting}
        type={type}
        onDeleted={onDeleted}
      />
    </form>
  );
}
