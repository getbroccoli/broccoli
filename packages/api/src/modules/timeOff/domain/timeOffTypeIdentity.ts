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
