import { invalidInput } from "../../../core/applicationError";
import {
  parseRules,
  rulesOfVersion,
  type TimeOffRules,
  type TimeOffRulesInput,
} from "./policyChange";
import { RECORD_ONLY_POLICY } from "./standardLeavePolicies";
import type { TimeOffTypeColour, TimeOffTypeIcon } from "./timeOffTypeLook";
import type { TimeOffTypeKey } from "./timeOffPolicy";

const NAME_MAX_LENGTH = 60;

/** What an admin sets on a type, the same in every set of terms. */
export interface TimeOffTypeIdentity {
  name: string;
  icon: TimeOffTypeIcon;
  colour: TimeOffTypeColour;
  private: boolean;
  /** The rules offering the type on terms starts from. */
  defaultRules: TimeOffRules;
}

/** What an admin sends for a type: its identity with the default rules as they came. */
export type TimeOffTypeIdentityInput = Omit<TimeOffTypeIdentity, "defaultRules"> & {
  defaultRules: TimeOffRulesInput;
};

/** Every seeded type starts with the rules setup gives all but Annual leave: recorded, not counted. */
const RECORD_ONLY_RULES = rulesOfVersion(RECORD_ONLY_POLICY);

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
    defaultRules: RECORD_ONLY_RULES,
    needsApproval: true,
  },
  sickness: {
    name: "Sickness",
    icon: "thermometer",
    colour: "coral",
    private: true,
    defaultRules: RECORD_ONLY_RULES,
    needsApproval: false,
  },
  family_leave: {
    name: "Family leave",
    icon: "baby",
    colour: "pink",
    private: true,
    defaultRules: RECORD_ONLY_RULES,
    needsApproval: true,
  },
  other: {
    name: "Other",
    icon: "confetti",
    colour: "yellow",
    private: false,
    defaultRules: RECORD_ONLY_RULES,
    needsApproval: true,
  },
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
 * The identity with its name trimmed and its default rules parsed; throws `INVALID_INPUT` on
 * `name` when blank or too long, on `private` when it would show Sickness's reason to colleagues,
 * and on `defaultRules` as `parseRules` does.
 */
export function parseTimeOffTypeIdentity(
  identity: TimeOffTypeIdentityInput,
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
  return { ...identity, name, defaultRules: parseRules(identity.defaultRules, "defaultRules") };
}
