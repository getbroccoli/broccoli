import type { MessageKey } from "@/i18n";

/** The message for a refused or failed location save: by the field error's code, else generic. */
export function saveFailure(
  error: { __typename: string; fields?: readonly { field: string; code: string }[] } | null,
  failure: unknown,
): MessageKey | null {
  if (!error) return failure ? "settings.locations.failed" : null;
  const field = error.fields?.[0];
  return (field && FIELD_MESSAGES[`${field.field}:${field.code}`]) || "settings.locations.failed";
}

const FIELD_MESSAGES: Partial<Record<string, MessageKey>> = {
  "name:required": "settings.locations.nameRequired",
  "name:too_long": "settings.locations.nameTooLong",
  "name:taken": "settings.locations.nameTaken",
  "termsId:not_found": "settings.locations.termsGone",
};
