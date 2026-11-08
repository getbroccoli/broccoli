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

export const ICONS: Record<IconName, Icon> = {
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

/** Every icon a type can show, in the picker's order. */
export const TIME_OFF_TYPE_ICONS = Object.keys(ICONS) as IconName[];

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

/** Every colour a type can show, in the picker's order. */
export const TIME_OFF_TYPE_COLOURS = Object.keys(HUES) as TimeOffTypeColour[];

/** The background and ink of a tile in this colour. */
export function tileStyle(colour: TimeOffTypeColour) {
  const hue = HUES[colour];
  return { background: `oklch(0.80 0.07 ${hue})`, color: `oklch(0.40 0.08 ${hue})` };
}
