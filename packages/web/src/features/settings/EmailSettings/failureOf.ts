import type { MailSource, SaveMailSettingsMutation } from "@/__generated__/graphql";
import type { MessageKey } from "@/i18n";

/** A refused save, worded for the owner; `field` names the input it is about, if any. */
export function failureOf(
  error: SaveMailSettingsError,
  source: MailSource,
): { message: MessageKey; field: "from" | "secret" | null } {
  if (error.__typename === "InvalidInputError") {
    const fromCode = error.fields.find(({ field }) => field === "from")?.code;
    if (fromCode) {
      return {
        message:
          fromCode === "required" ? "settings.email.fromRequired" : "settings.email.fromInvalid",
        field: "from",
      };
    }
    const secretCode = error.fields.find(({ field }) => field === "secret")?.code;
    if (secretCode) {
      return { message: secretMessage(secretCode, source), field: "secret" };
    }
  }
  if (error.__typename === "UnavailableError") {
    return { message: "settings.email.unavailable", field: null };
  }
  return { message: "settings.email.failed", field: null };
}

type SaveMailSettingsError = NonNullable<
  SaveMailSettingsMutation["setup"]["saveMailSettings"]["error"]
>;

function secretMessage(code: string, source: MailSource): MessageKey {
  if (source === "RESEND_API") {
    return "settings.email.resendKeyRequired";
  }
  if (code === "rejected") {
    return "settings.email.smtpRejected";
  }
  return code === "required" ? "settings.email.smtpUrlRequired" : "settings.email.smtpUrlInvalid";
}
