import type { SetupInviteAudience, TurnOnLeaveInput } from "@/__generated__/graphql";
import { postJson } from "@/lib/postJson";

/** How an attempt to create the owner ended, as the setup form reports it. */
export type SetupResult = "ok" | "invalidInput" | "conflict" | "tooManyAttempts" | "failed";

const SETUP_RESULT_BY_STATUS: Partial<Record<number, SetupResult>> = {
  200: "ok",
  400: "invalidInput",
  // Another account already has the email.
  422: "invalidInput",
  // The owner exists, another browser holds setup, or setup is at another step.
  409: "conflict",
  429: "tooManyAttempts",
};

/**
 * Starts setup in this browser, or renews it for the browser holding it; the API sets
 * the setup cookie. Returns whether this browser holds setup.
 */
export async function startSetup(): Promise<boolean> {
  try {
    return (await postJson("/api/auth/setup/start", {})).ok;
  } catch {
    return false;
  }
}

/** What the owner chose on "Set up leave" and "Who uses Broccoli", sent with their account. */
export interface OwnerSetupChoices {
  ownerEmployeeKey: string | null;
  inviteAudience: SetupInviteAudience;
  inviteNote: string | null;
  leave: TurnOnLeaveInput | null;
}

/** An invite setup sent; the link only when the owner copies it. */
export interface OwnerSetupInvite {
  employeeId: string;
  name: string;
  expiresAt: string;
  link: string | null;
}

/** How creating the owner ended, with the invites it sent and, when refused, the fields at fault. */
export interface OwnerSetupOutcome {
  result: SetupResult;
  invites: OwnerSetupInvite[];
  fieldErrors: { field: string; code: string }[];
}

/**
 * Creates the instance's owner, adds the approved people and sends the chosen invites, then signs
 * the owner in; the API sets the session cookie.
 */
export async function setUpOwner(
  email: string,
  password: string,
  choices: OwnerSetupChoices,
): Promise<OwnerSetupOutcome> {
  try {
    const response = await postJson("/api/auth/setup", {
      email,
      password,
      ...choices,
      inviteAudience: AUDIENCES[choices.inviteAudience],
      leave: choices.leave && lowerCaseLeave(choices.leave),
    });
    const body = (await response.json().catch(() => ({}))) as Partial<{
      invites: OwnerSetupInvite[];
      fieldErrors: { field: string; code: string }[];
    }>;
    return {
      result: SETUP_RESULT_BY_STATUS[response.status] ?? "failed",
      invites: body.invites ?? [],
      fieldErrors: body.fieldErrors ?? [],
    };
  } catch {
    return { result: "failed", invites: [], fieldErrors: [] };
  }
}

const AUDIENCES = {
  ONLY_ADMINS: "only_admins",
  ADMINS_AND_MANAGERS: "admins_and_managers",
  EVERYONE: "everyone",
} as const satisfies Record<SetupInviteAudience, string>;

/** The API takes the leave choice's values in lower case, as it stores them. */
function lowerCaseLeave({ terms, locationTerms }: TurnOnLeaveInput) {
  return {
    terms: terms.map((entry) => ({
      ...entry,
      bankHolidayCalendar: entry.bankHolidayCalendar.toLowerCase(),
      workingWeek: entry.workingWeek.toLowerCase(),
    })),
    locationTerms: locationTerms.map((entry) => ({
      ...entry,
      bankHolidayCalendar: entry.bankHolidayCalendar.toLowerCase(),
    })),
  };
}
