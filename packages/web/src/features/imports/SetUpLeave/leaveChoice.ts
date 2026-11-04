import type {
  BankHolidayCalendar,
  StandardWorkingWeek,
  TurnOnLeaveInput,
} from "@/__generated__/graphql";

/**
 * The owner's Set up leave page as they left it, kept for this tab until setup finishes or is
 * reset: never in the URL, since location names can be long or personal. Where storage fails,
 * such as in some private windows, it lasts until a reload.
 */
export interface LeaveSetupState {
  weeks: Partial<Record<BankHolidayCalendar, StandardWorkingWeek>>;
  policies: Partial<Record<BankHolidayCalendar, string>>;
  /** The nation the owner picked per location name. */
  picked: Record<string, BankHolidayCalendar>;
  /** What setup's last page sends: the choice on Turn on, null on Skip for now, absent before either. */
  leave?: TurnOnLeaveInput | null;
}

export function readLeaveSetup(): LeaveSetupState {
  try {
    const stored = sessionStorage.getItem(KEY);
    return stored === null ? inMemory : (JSON.parse(stored) as LeaveSetupState);
  } catch {
    return inMemory;
  }
}

export function saveLeaveSetup(state: LeaveSetupState): void {
  inMemory = state;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Kept in memory instead.
  }
}

/** Forgets the page once setup finishes or starts over, so the next setup begins fresh. */
export function clearLeaveSetup(): void {
  inMemory = EMPTY;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing was stored.
  }
}

const KEY = "broccoli.setup.leave";

const EMPTY: LeaveSetupState = { weeks: {}, policies: {}, picked: {} };

let inMemory = EMPTY;
