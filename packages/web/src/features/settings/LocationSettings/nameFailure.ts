import type { MessageKey } from "@/i18n";

/** The message for a refused or failed location save: by the `name` field's error code, else generic. */
export function nameFailure(
  error: { __typename: string; fields?: readonly { field: string; code: string }[] } | null,
  failure: unknown,
): MessageKey | null {
  if (!error) return failure ? "settings.locations.failed" : null;
  const code = error.fields?.find(({ field }) => field === "name")?.code;
  return (code && NAME_MESSAGES[code]) || "settings.locations.failed";
}

const NAME_MESSAGES: Partial<Record<string, MessageKey>> = {
  required: "settings.locations.nameRequired",
  too_long: "settings.locations.nameTooLong",
  taken: "settings.locations.nameTaken",
};
