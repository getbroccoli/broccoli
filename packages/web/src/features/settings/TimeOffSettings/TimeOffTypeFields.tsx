import { CaretRight } from "@phosphor-icons/react";

import type { TimeOffTypeColour, TimeOffTypeIcon as IconName } from "@/__generated__/graphql";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { t, type MessageKey } from "@/i18n";
import {
  ICONS,
  tileStyle,
  TIME_OFF_TYPE_COLOURS,
  TIME_OFF_TYPE_ICONS,
  TimeOffTypeIcon,
} from "@/features/termsDisplay";

import { daysError, type RulesValues } from "./timeOffRules";
import { TimeOffRulesFields } from "./TimeOffRulesFields";

/** What an admin sets on a type: its identity, the same in every set of terms, and default rules. */
export type TimeOffTypeValues = {
  name: string;
  icon: IconName;
  colour: TimeOffTypeColour;
  private: boolean;
  defaultRules: RulesValues;
};

type Props = {
  values: TimeOffTypeValues;
  onChange: (values: TimeOffTypeValues) => void;
  /** Sickness stays private, so its switch is locked. */
  sickness: boolean;
  /** The refused name's message, shown under the field. */
  nameError: MessageKey | null;
};

/**
 * A type's name, icon, colour, privacy and default rules, as the Add dialog and the type's panel
 * edit them.
 */
export function TimeOffTypeFields({ values, onChange, sickness, nameError }: Props) {
  const { name, icon, colour } = values;
  const trimmed = name.trim();
  const change = (patch: Partial<TimeOffTypeValues>) => onChange({ ...values, ...patch });

  return (
    <>
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
            onChange={(event) => change({ name: event.target.value })}
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
        <div className="flex flex-wrap gap-1.5">
          {TIME_OFF_TYPE_ICONS.map((option) => {
            const Glyph = ICONS[option];
            return (
              <label
                key={option}
                className="relative grid size-10 cursor-pointer place-items-center rounded-lg border border-transparent bg-muted/60 text-muted-foreground has-checked:border-foreground has-checked:bg-background has-checked:text-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
              >
                <input
                  type="radio"
                  name="time-off-type-icon"
                  className="sr-only"
                  aria-label={t(ICON_LABELS[option])}
                  checked={icon === option}
                  onChange={() => change({ icon: option })}
                />
                <Glyph aria-hidden size={17} />
              </label>
            );
          })}
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
                aria-label={t(COLOUR_LABELS[option])}
                checked={colour === option}
                onChange={() => change({ colour: option })}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-start gap-3">
        <Switch
          id="time-off-type-show-reason"
          className="mt-0.5"
          checked={!values.private}
          disabled={sickness}
          aria-describedby="time-off-type-show-reason-hint"
          onCheckedChange={(showReason) => change({ private: !showReason })}
        />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="time-off-type-show-reason">{t("settings.timeOff.showReason")}</Label>
          <p id="time-off-type-show-reason-hint" className="text-sm text-muted-foreground">
            {sickness
              ? t("settings.timeOff.sicknessPrivate")
              : values.private
                ? t("settings.timeOff.showReasonOff")
                : trimmed
                  ? t("settings.timeOff.showReasonOn", { name: trimmed })
                  : t("settings.timeOff.showReasonUnnamed")}
          </p>
        </div>
      </div>
      {/* Collapsed: the defaults only fill in an offer, so most edits never need them. */}
      <details
        className="group rounded-lg border"
        onToggle={(event) => {
          // Stays open while the days are wrong, so the message that keeps Save off stays visible.
          if (!event.currentTarget.open && daysError(values.defaultRules)) {
            event.currentTarget.open = true;
          }
        }}
      >
        <summary className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
          <CaretRight
            aria-hidden
            className="mt-0.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{t("settings.timeOff.defaultRules")}</span>
            <span className="text-sm text-muted-foreground">
              {t("settings.timeOff.defaultRulesHint")}
            </span>
          </span>
        </summary>
        <div className="flex flex-col gap-5 px-4 pb-4">
          <TimeOffRulesFields
            values={values.defaultRules}
            onChange={(defaultRules) => change({ defaultRules })}
          />
        </div>
      </details>
    </>
  );
}

const ICON_LABELS = {
  SUN: "settings.timeOff.iconSun",
  UMBRELLA: "settings.timeOff.iconUmbrella",
  AIRPLANE: "settings.timeOff.iconAeroplane",
  MOUNTAINS: "settings.timeOff.iconMountains",
  TREE: "settings.timeOff.iconTree",
  LEAF: "settings.timeOff.iconLeaf",
  BICYCLE: "settings.timeOff.iconBicycle",
  CAR: "settings.timeOff.iconCar",
  COFFEE: "settings.timeOff.iconCoffee",
  MOON: "settings.timeOff.iconMoon",
  THERMOMETER: "settings.timeOff.iconThermometer",
  FIRST_AID: "settings.timeOff.iconFirstAid",
  HEARTBEAT: "settings.timeOff.iconHeartbeat",
  HEART: "settings.timeOff.iconHeart",
  HAND_HEART: "settings.timeOff.iconCare",
  FLOWER: "settings.timeOff.iconFlower",
  BABY: "settings.timeOff.iconBaby",
  BACKPACK: "settings.timeOff.iconBackpack",
  HOUSE_LINE: "settings.timeOff.iconHouse",
  USERS_THREE: "settings.timeOff.iconPeople",
  GRADUATION_CAP: "settings.timeOff.iconGraduationCap",
  BOOK_OPEN: "settings.timeOff.iconBook",
  BRIEFCASE: "settings.timeOff.iconBriefcase",
  TRUCK: "settings.timeOff.iconLorry",
  SCALES: "settings.timeOff.iconScales",
  WALLET: "settings.timeOff.iconWallet",
  LIFEBUOY: "settings.timeOff.iconLifebuoy",
  CONFETTI: "settings.timeOff.iconConfetti",
  STAR: "settings.timeOff.iconStar",
  SPARKLE: "settings.timeOff.iconSparkle",
} as const satisfies Record<IconName, MessageKey>;

const COLOUR_LABELS = {
  GREEN: "settings.timeOff.colourGreen",
  CORAL: "settings.timeOff.colourCoral",
  YELLOW: "settings.timeOff.colourYellow",
  LIME: "settings.timeOff.colourLime",
  TEAL: "settings.timeOff.colourTeal",
  BLUE: "settings.timeOff.colourBlue",
  INDIGO: "settings.timeOff.colourIndigo",
  PURPLE: "settings.timeOff.colourPurple",
  PINK: "settings.timeOff.colourPink",
  RED: "settings.timeOff.colourRed",
} as const satisfies Record<TimeOffTypeColour, MessageKey>;
