import type { TimeOffTypeColour, TimeOffTypeIcon as IconName } from "@/__generated__/graphql";

import { ICONS, tileStyle } from "./timeOffTypeLook";

type Props = { icon: IconName; colour: TimeOffTypeColour };

/** A time off type's icon on its colour; decorative, since the type's name sits beside it. */
export function TimeOffTypeIcon({ icon, colour }: Props) {
  const Glyph = ICONS[icon];
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-lg"
      style={tileStyle(colour)}
    >
      <Glyph size={18} weight="duotone" />
    </span>
  );
}
