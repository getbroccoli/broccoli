import type { TimeOffTypeColour, TimeOffTypeIcon as IconName } from "@/__generated__/graphql";

import { TIME_OFF_TYPE_HUES, TIME_OFF_TYPE_ICONS } from "./timeOffTypeLook";

type Props = {
  icon: IconName;
  colour: TimeOffTypeColour;
  /** "large" for the type's panel header. */
  size?: "large";
};

/** A time off type's icon on its colour; decorative, since the type's name sits beside it. */
export function TimeOffTypeIcon({ icon, colour, size }: Props) {
  const Glyph = TIME_OFF_TYPE_ICONS[icon];
  const hue = TIME_OFF_TYPE_HUES[colour];
  return (
    <span
      aria-hidden
      className={
        size === "large"
          ? "grid size-13 shrink-0 place-items-center rounded-xl"
          : "grid size-8 shrink-0 place-items-center rounded-lg"
      }
      style={{ background: `oklch(0.80 0.07 ${hue})`, color: `oklch(0.40 0.08 ${hue})` }}
    >
      <Glyph size={size === "large" ? 26 : 18} weight="duotone" />
    </span>
  );
}
