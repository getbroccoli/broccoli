/** The icons a time off type can show, by name. */
export const TIME_OFF_TYPE_ICONS = [
  "sun",
  "umbrella",
  "airplane",
  "mountains",
  "tree",
  "leaf",
  "bicycle",
  "car",
  "coffee",
  "moon",
  "thermometer",
  "first_aid",
  "heartbeat",
  "heart",
  "hand_heart",
  "flower",
  "baby",
  "backpack",
  "house_line",
  "users_three",
  "graduation_cap",
  "book_open",
  "briefcase",
  "truck",
  "scales",
  "wallet",
  "lifebuoy",
  "confetti",
  "star",
  "sparkle",
] as const;

/** The colours a time off type's icon can sit on. */
export const TIME_OFF_TYPE_COLOURS = [
  "green",
  "coral",
  "yellow",
  "lime",
  "teal",
  "blue",
  "indigo",
  "purple",
  "pink",
  "red",
] as const;

export type TimeOffTypeIcon = (typeof TIME_OFF_TYPE_ICONS)[number];
export type TimeOffTypeColour = (typeof TIME_OFF_TYPE_COLOURS)[number];

/** What a type shows when it has no icon or colour of its own. */
export const DEFAULT_TIME_OFF_TYPE_LOOK = { icon: "sun", colour: "yellow" } as const satisfies {
  icon: TimeOffTypeIcon;
  colour: TimeOffTypeColour;
};
