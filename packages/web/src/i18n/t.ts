import { en } from "./en";

export type MessageKey = keyof typeof en;

/** Returns the user-facing text for `key`, with each `{name}` replaced by `params.name`. */
export function t(key: MessageKey, params: Record<string, string> = {}): string {
  return en[key].replace(/\{(\w+)\}/g, (placeholder, name: string) => params[name] ?? placeholder);
}
