import type { TimeOffTypeColour, TimeOffTypeIcon as IconName } from "@/__generated__/graphql";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { TimeOffTypeIcon } from "../TimeOffSettings/TimeOffTypeIcon";
import { TIME_OFF_TYPE_HUES, TIME_OFF_TYPE_ICONS } from "../TimeOffSettings/timeOffTypeLook";

type Props = {
  icon: IconName;
  colour: TimeOffTypeColour;
  disabled: boolean;
  onChange: (look: { icon?: IconName; colour?: TimeOffTypeColour }) => void;
};

/** The type's icon on its colour, as a button that opens the colours and icons to pick from. */
export function IconPicker({ icon, colour, disabled, onChange }: Props) {
  return (
    <Popover>
      <PopoverTrigger
        disabled={disabled}
        aria-label={t("settings.timeOffType.changeLook")}
        className="rounded-xl ring-offset-2 outline-none hover:ring-2 hover:ring-border focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <TimeOffTypeIcon icon={icon} colour={colour} size="large" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">{t("settings.timeOffType.colour")}</legend>
          {(Object.keys(TIME_OFF_TYPE_HUES) as TimeOffTypeColour[]).map((option) => (
            <label
              key={option}
              className={cn(
                "size-6 cursor-pointer rounded-full ring-offset-2 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                option === colour && "ring-2 ring-foreground",
              )}
              style={{ background: `oklch(0.80 0.07 ${TIME_OFF_TYPE_HUES[option]})` }}
            >
              <input
                type="radio"
                className="sr-only"
                name="time-off-type-colour"
                aria-label={t(`settings.timeOffType.colours.${option}`)}
                checked={option === colour}
                onChange={() => onChange({ colour: option })}
              />
            </label>
          ))}
        </fieldset>
        <fieldset className="mt-3 grid grid-cols-6 gap-1">
          <legend className="sr-only">{t("settings.timeOffType.icon")}</legend>
          {(
            Object.entries(TIME_OFF_TYPE_ICONS) as [
              IconName,
              (typeof TIME_OFF_TYPE_ICONS)[IconName],
            ][]
          ).map(([option, Glyph]) => (
            <label
              key={option}
              className={cn(
                "grid size-10 cursor-pointer place-items-center rounded-md has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                option === icon ? "bg-foreground text-background" : "hover:bg-muted",
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name="time-off-type-icon"
                aria-label={t(`settings.timeOffType.icons.${option}`)}
                checked={option === icon}
                onChange={() => onChange({ icon: option })}
              />
              <Glyph size={20} aria-hidden />
            </label>
          ))}
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}
