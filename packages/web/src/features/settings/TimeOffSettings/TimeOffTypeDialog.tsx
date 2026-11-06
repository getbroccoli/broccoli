import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import {
  ChangeTimeOffTypeDocument,
  CreateTimeOffTypeDocument,
  type TimeOffTypeColour,
  type TimeOffTypeIcon as IconName,
  TimeOffSettingsDocument,
  type TimeOffSettingsQuery,
} from "@/__generated__/graphql";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { t, type MessageKey } from "@/i18n";

import { TimeOffTypeGlyph, TimeOffTypeIcon } from "./TimeOffTypeIcon";
import { TIME_OFF_TYPE_COLOURS, TIME_OFF_TYPE_ICONS, tileStyle } from "./timeOffTypeLook";

/** A time off type as Settings › Time off lists it. */
export type ListedTimeOffType =
  TimeOffSettingsQuery["timeOffSettings"]["timeOffTypes"][number]["timeOffType"];

type Props = {
  /** The type to edit; null adds one. */
  type: ListedTimeOffType | null;
  onClose: () => void;
};

/** A new type starts with the default look, and colleagues see its name. */
const NEW_TYPE = { name: "", icon: "SUN", colour: "YELLOW", private: false } as const;

/** Adds a time off type, or changes one's name, icon, colour and privacy, for the whole company. */
export function TimeOffTypeDialog({ type, onClose }: Props) {
  const [name, setName] = useState<string>(type?.name ?? NEW_TYPE.name);
  const [icon, setIcon] = useState<IconName>(type?.icon ?? NEW_TYPE.icon);
  const [colour, setColour] = useState<TimeOffTypeColour>(type?.colour ?? NEW_TYPE.colour);
  const [isPrivate, setPrivate] = useState(type?.private ?? NEW_TYPE.private);
  // The list is ordered by name on the server, so it reloads after either save.
  const options = { refetch: [TimeOffSettingsDocument] };
  const [createType, creation] = usePayloadMutation(CreateTimeOffTypeDocument, options);
  const [changeType, change] = usePayloadMutation(ChangeTimeOffTypeDocument, options);
  const { loading, error, payloadError } = type ? change : creation;
  const sickness = type?.typeKey === "SICKNESS";
  const trimmed = name.trim();
  const nameError = nameErrorOf(payloadError);
  const failed = !nameError && (error || payloadError);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const identity = { name, icon, colour, private: isPrivate };
    try {
      const saved = type
        ? (await changeType({ variables: { input: { timeOffTypeId: type.id, ...identity } } }))
            .timeOffType
        : (await createType({ variables: { input: identity } })).timeOffType;
      const savedName = saved?.name ?? trimmed;
      toast(t(type ? "settings.timeOff.saved" : "settings.timeOff.added", { name: savedName }));
      onClose();
    } catch {
      // The form shows the failure.
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent className="sm:max-w-lg" closeLabel={t("settings.timeOff.close")}>
        <form onSubmit={(event) => void save(event)} className="flex flex-col gap-5">
          <DialogHeader>
            {type ? (
              <div className="flex items-center gap-3">
                <TimeOffTypeIcon icon={type.icon} colour={type.colour} />
                <div>
                  <DialogTitle className="[overflow-wrap:anywhere]">{type.name}</DialogTitle>
                  <DialogDescription>{t("settings.timeOff.editHint")}</DialogDescription>
                </div>
              </div>
            ) : (
              <>
                <DialogTitle>{t("settings.timeOff.addTitle")}</DialogTitle>
                <DialogDescription>{t("settings.timeOff.addHint")}</DialogDescription>
              </>
            )}
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="time-off-type-name">{t("settings.timeOff.name")}</Label>
            <div className="flex items-center gap-3">
              <TimeOffTypeIcon icon={icon} colour={colour} />
              <Input
                id="time-off-type-name"
                value={name}
                maxLength={200}
                aria-invalid={nameError !== null}
                aria-describedby={nameError ? "time-off-type-name-error" : undefined}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            {nameError && (
              <p id="time-off-type-name-error" role="alert" className="text-sm text-destructive">
                {t(nameError, { name: trimmed })}
              </p>
            )}
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">{t("settings.timeOff.icon")}</legend>
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
              {TIME_OFF_TYPE_ICONS.map((option) => (
                <label
                  key={option}
                  className="relative grid h-9 cursor-pointer place-items-center rounded-lg border border-transparent bg-muted/60 text-muted-foreground has-checked:border-foreground has-checked:bg-background has-checked:text-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                >
                  <input
                    type="radio"
                    name="time-off-type-icon"
                    className="sr-only"
                    aria-label={inWords(option)}
                    checked={icon === option}
                    onChange={() => setIcon(option)}
                  />
                  <TimeOffTypeGlyph icon={option} />
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">{t("settings.timeOff.colour")}</legend>
            <div className="flex flex-wrap gap-2">
              {TIME_OFF_TYPE_COLOURS.map((option) => (
                <label
                  key={option}
                  className="relative size-7 cursor-pointer rounded-full border-2 border-background shadow-[0_0_0_1px_var(--color-border)] has-checked:shadow-[0_0_0_2px_var(--color-foreground)] has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                  style={{ background: tileStyle(option).background }}
                >
                  <input
                    type="radio"
                    name="time-off-type-colour"
                    className="sr-only"
                    aria-label={inWords(option)}
                    checked={colour === option}
                    onChange={() => setColour(option)}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex items-start gap-3">
            <Switch
              id="time-off-type-show-reason"
              className="mt-0.5"
              checked={!isPrivate}
              disabled={sickness}
              aria-describedby="time-off-type-show-reason-hint"
              onCheckedChange={(showReason) => setPrivate(!showReason)}
            />
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="time-off-type-show-reason">{t("settings.timeOff.showReason")}</Label>
              <p id="time-off-type-show-reason-hint" className="text-sm text-muted-foreground">
                {sickness
                  ? t("settings.timeOff.sicknessPrivate")
                  : isPrivate
                    ? t("settings.timeOff.showReasonOff")
                    : trimmed
                      ? t("settings.timeOff.showReasonOn", { name: trimmed })
                      : t("settings.timeOff.showReasonUnnamed")}
              </p>
            </div>
          </div>
          {failed && (
            <p role="alert" className="text-sm text-destructive">
              {t("settings.timeOff.saveFailed")}
            </p>
          )}
          <DialogFooter className="sm:items-center">
            <p className="text-sm text-muted-foreground sm:mr-auto">
              {type
                ? t("settings.timeOff.sameEverywhere")
                : trimmed
                  ? t("settings.timeOff.addsNamed", { name: trimmed })
                  : t("settings.timeOff.adds")}
            </p>
            <Button type="button" variant="ghost" disabled={loading} onClick={onClose}>
              {t("settings.timeOff.cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {type ? t("settings.timeOff.save") : t("settings.timeOff.add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The message for a refused name, by the `name` field's error code. */
function nameErrorOf(
  error: { __typename: string; fields?: readonly { field: string; code: string }[] } | null,
): MessageKey | null {
  const code = error?.fields?.find(({ field }) => field === "name")?.code;
  return (code && NAME_MESSAGES[code]) || null;
}

const NAME_MESSAGES: Partial<Record<string, MessageKey>> = {
  required: "settings.timeOff.nameRequired",
  too_long: "settings.timeOff.nameTooLong",
  taken: "settings.timeOff.nameTaken",
};

/** An enum value as words for a screen reader: GRADUATION_CAP → "Graduation cap". */
function inWords(value: string): string {
  const words = value.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
