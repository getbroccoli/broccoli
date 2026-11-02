import type { MessageKey } from "@/i18n";

/** The message for a location name the server refused, by the `name` field's error code. */
export function nameFailure(
  error: { __typename: string; fields?: readonly { field: string; code: string }[] } | null,
): MessageKey | null {
  if (!error) return null;
  const code = error.fields?.find(({ field }) => field === "name")?.code;
  return (code && NAME_MESSAGES[code]) || "settings.locations.failed";
}

const NAME_MESSAGES: Partial<Record<string, MessageKey>> = {
  required: "settings.locations.nameRequired",
  too_long: "settings.locations.nameTooLong",
  taken: "settings.locations.nameTaken",
};
