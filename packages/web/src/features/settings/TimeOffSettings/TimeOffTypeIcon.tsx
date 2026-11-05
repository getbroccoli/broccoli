import {
  Airplane,
  Baby,
  Backpack,
  Bicycle,
  BookOpen,
  Briefcase,
  Car,
  Coffee,
  Confetti,
  FirstAid,
  Flower,
  GraduationCap,
  HandHeart,
  Heart,
  Heartbeat,
  HouseLine,
  type Icon,
  Leaf,
  Lifebuoy,
  Moon,
  Mountains,
  Scales,
  Sparkle,
  Star,
  Sun,
  Thermometer,
  Tree,
  Truck,
  Umbrella,
  UsersThree,
  Wallet,
} from "@phosphor-icons/react";

import type { TimeOffTypeColour, TimeOffTypeIcon as IconName } from "@/__generated__/graphql";

type Props = { icon: IconName; colour: TimeOffTypeColour };

/** A time off type's icon on its colour; decorative, since the type's name sits beside it. */
export function TimeOffTypeIcon({ icon, colour }: Props) {
  const Glyph = ICONS[icon];
  const hue = HUES[colour];
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-lg"
      style={{ background: `oklch(0.80 0.07 ${hue})`, color: `oklch(0.40 0.08 ${hue})` }}
    >
      <Glyph size={18} weight="duotone" />
    </span>
  );
}

const ICONS: Record<IconName, Icon> = {
  SUN: Sun,
  UMBRELLA: Umbrella,
  AIRPLANE: Airplane,
  MOUNTAINS: Mountains,
  TREE: Tree,
  LEAF: Leaf,
  BICYCLE: Bicycle,
  CAR: Car,
  COFFEE: Coffee,
  MOON: Moon,
  THERMOMETER: Thermometer,
  FIRST_AID: FirstAid,
  HEARTBEAT: Heartbeat,
  HEART: Heart,
  HAND_HEART: HandHeart,
  FLOWER: Flower,
  BABY: Baby,
  BACKPACK: Backpack,
  HOUSE_LINE: HouseLine,
  USERS_THREE: UsersThree,
  GRADUATION_CAP: GraduationCap,
  BOOK_OPEN: BookOpen,
  BRIEFCASE: Briefcase,
  TRUCK: Truck,
  SCALES: Scales,
  WALLET: Wallet,
  LIFEBUOY: Lifebuoy,
  CONFETTI: Confetti,
  STAR: Star,
  SPARKLE: Sparkle,
};

/** Each colour's hue on the shared oklch time off palette. */
const HUES: Record<TimeOffTypeColour, number> = {
  GREEN: 150,
  CORAL: 25,
  YELLOW: 60,
  LIME: 100,
  TEAL: 180,
  BLUE: 220,
  INDIGO: 260,
  PURPLE: 300,
  PINK: 330,
  RED: 0,
};
