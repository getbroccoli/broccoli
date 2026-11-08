import type { MessageKey } from "@/i18n";

/** The message for a refused name, by the `name` field's error code; null for any other error. */
export function nameErrorOf(
  error: { __typename: string; fields?: readonly { field: string; code: string }[] } | null,
): MessageKey | null {
  const code = error?.fields?.find(({ field }) => field === "name")?.code;
  return (code && NAME_MESSAGES[code]) || null;
}

const NAME_MESSAGES: Partial<Record<string, MessageKey>> = {
  required: "settings.timeOff.nameRequired",
  too_long: "settings.timeOff.nameTooLong",
  taken: "settings.timeOff.nameTaken",
};
