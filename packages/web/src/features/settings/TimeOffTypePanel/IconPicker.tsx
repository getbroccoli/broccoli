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
        <div
          role="radiogroup"
          aria-label={t("settings.timeOffType.colour")}
          className="flex flex-wrap gap-2"
        >
          {(Object.keys(TIME_OFF_TYPE_HUES) as TimeOffTypeColour[]).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={option === colour}
              aria-label={t(`settings.timeOffType.colours.${option}`)}
              onClick={() => onChange({ colour: option })}
              className={cn(
                "size-6 rounded-full ring-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                option === colour && "ring-2 ring-foreground",
              )}
              style={{ background: `oklch(0.80 0.07 ${TIME_OFF_TYPE_HUES[option]})` }}
            />
          ))}
        </div>
        <div
          role="radiogroup"
          aria-label={t("settings.timeOffType.icon")}
          className="mt-3 grid grid-cols-6 gap-1"
        >
          {(
            Object.entries(TIME_OFF_TYPE_ICONS) as [
              IconName,
              (typeof TIME_OFF_TYPE_ICONS)[IconName],
            ][]
          ).map(([option, Glyph]) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={option === icon}
              aria-label={t(`settings.timeOffType.icons.${option}`)}
              onClick={() => onChange({ icon: option })}
              className={cn(
                "grid size-10 place-items-center rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                option === icon ? "bg-foreground text-background" : "hover:bg-muted",
              )}
            >
              <Glyph size={20} />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
