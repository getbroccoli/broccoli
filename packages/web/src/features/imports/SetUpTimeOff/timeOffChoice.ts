import type {
  BankHolidayCalendar,
  StandardWorkingWeek,
  TurnOnTimeOffInput,
} from "@/__generated__/graphql";

/**
 * The owner's Set up time off page as they left it, kept for this tab until setup finishes or is
 * reset: never in the URL, since location names can be long or personal. Where storage fails,
 * such as in some private windows, it lasts until a reload.
 */
export interface TimeOffSetupState {
  weeks: Partial<Record<BankHolidayCalendar, StandardWorkingWeek>>;
  policies: Partial<Record<BankHolidayCalendar, string>>;
  /** The nation the owner picked per location name. */
  picked: Record<string, BankHolidayCalendar>;
  /** What setup's last page sends: the choice on Turn on, null on Skip for now, absent before either. */
  timeOff?: TurnOnTimeOffInput | null;
}

export function readTimeOffSetup(): TimeOffSetupState {
  try {
    const stored = sessionStorage.getItem(KEY);
    return stored === null ? inMemory : (JSON.parse(stored) as TimeOffSetupState);
  } catch {
    return inMemory;
  }
}

export function saveTimeOffSetup(state: TimeOffSetupState): void {
  inMemory = state;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Kept in memory instead.
  }
}

/** Forgets the page once setup finishes or starts over, so the next setup begins fresh. */
export function clearTimeOffSetup(): void {
  inMemory = EMPTY;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing was stored.
  }
}

const KEY = "broccoli.setup.timeOff";

const EMPTY: TimeOffSetupState = { weeks: {}, policies: {}, picked: {} };

let inMemory = EMPTY;
