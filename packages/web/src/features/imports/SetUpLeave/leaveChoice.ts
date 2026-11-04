import type { TurnOnLeaveInput } from "@/__generated__/graphql";

/**
 * The owner's Set up leave choice, kept for this tab until setup's last page sends it: never in
 * the URL, since location names can be long or personal. Null is Skip for now; undefined, no
 * choice yet. Where storage fails, such as in some private windows, the choice lasts until a reload.
 */
export function readLeaveChoice(): TurnOnLeaveInput | null | undefined {
  try {
    const stored = sessionStorage.getItem(KEY);
    return stored === null ? inMemory : (JSON.parse(stored) as TurnOnLeaveInput | null);
  } catch {
    return inMemory;
  }
}

export function saveLeaveChoice(choice: TurnOnLeaveInput | null): void {
  inMemory = choice;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(choice));
  } catch {
    // Kept in memory instead.
  }
}

let inMemory: TurnOnLeaveInput | null | undefined;

const KEY = "broccoli.setup.leave";
