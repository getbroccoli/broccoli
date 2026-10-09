import { en } from "./en";

export type MessageKey = keyof typeof en;

/** Returns the user-facing text for `key`. */
export function t(key: MessageKey): string {
  return en[key];
}
