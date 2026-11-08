import { invalidInput } from "../../../core/applicationError";
import type { TimeOffTypeColour, TimeOffTypeIcon } from "./timeOffTypeLook";
import type { TimeOffTypeKey } from "./timeOffPolicy";

const NAME_MAX_LENGTH = 60;

/** What an admin sets on a type, the same in every set of terms. */
export interface TimeOffTypeIdentity {
  name: string;
  icon: TimeOffTypeIcon;
  colour: TimeOffTypeColour;
  private: boolean;
}

/** The four seeded types as the migration inserts them, which starting over restores. */
export const STANDARD_TIME_OFF_TYPES: Record<
  TimeOffTypeKey,
  TimeOffTypeIdentity & { needsApproval: boolean }
> = {
  annual_leave: {
    name: "Annual leave",
    icon: "sun",
    colour: "green",
    private: false,
    needsApproval: true,
  },
  sickness: {
    name: "Sickness",
    icon: "thermometer",
    colour: "coral",
    private: true,
    needsApproval: false,
  },
  family_leave: {
    name: "Family leave",
    icon: "baby",
    colour: "pink",
    private: true,
    needsApproval: true,
  },
  other: { name: "Other", icon: "confetti", colour: "yellow", private: false, needsApproval: true },
};

/** Time off of the type is on record, so deleting the type would lose it. */
export class TimeOffTypeBookedError extends Error {
  constructor() {
    super("Time off of this type is on record");
    this.name = "TimeOffTypeBookedError";
  }
}

/** Another type already has this name, ignoring case and surrounding spaces. */
export class TimeOffTypeNameTakenError extends Error {
  constructor() {
    super("Another time off type already has this name");
    this.name = "TimeOffTypeNameTakenError";
  }
}

/**
 * The identity with its name trimmed; throws `INVALID_INPUT` on `name` when blank or too long,
 * and on `private` when it would show Sickness's reason to colleagues.
 */
export function parseTimeOffTypeIdentity(
  identity: TimeOffTypeIdentity,
  typeKey: TimeOffTypeKey | null,
): TimeOffTypeIdentity {
  const name = identity.name.trim();
  if (!name) {
    throw invalidInput([{ field: "name", code: "required" }]);
  }
  if (name.length > NAME_MAX_LENGTH) {
    throw invalidInput([{ field: "name", code: "too_long" }]);
  }
  // Sickness is health data: colleagues only ever see that the person is away.
  if (typeKey === "sickness" && !identity.private) {
    throw invalidInput([{ field: "private", code: "sickness_private" }]);
  }
  return { ...identity, name };
}
