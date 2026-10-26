import { z } from "zod";

import { type FieldError, invalidInput } from "../../applicationError";

/** How a self-hosted instance sends email: the owner's SMTP server, their Resend key, or not at all. */
export const MAIL_SOURCES = ["smtp_server", "resend_api", "no_email"] as const;

export type MailSource = (typeof MAIL_SOURCES)[number];

/** The saved mail choice; the SMTP URL or Resend key itself is read separately. */
export interface MailConfig {
  source: MailSource;
  from: string | null;
  hasSecret: boolean;
}

/** The owner's mail choice as they submit it. */
export interface MailChoice {
  source: MailSource;
  from?: string | null;
  /** The SMTP URL or the Resend key; blank keeps the saved one. */
  secret?: string | null;
}

/** What saving a choice stores: `secret` undefined keeps the saved one, null forgets it. */
export interface MailSettingsChange {
  source: MailSource;
  from: string | null;
  secret: string | null | undefined;
}

/**
 * Checks a choice against the saved one. A secret belongs to its source, so changing the source
 * needs a new one; No email forgets it and keeps the From address for later.
 */
export function decideMailSettings(choice: MailChoice, saved: MailConfig): MailSettingsChange {
  if (choice.source === "no_email") {
    return { source: "no_email", from: saved.from, secret: null };
  }
  const from = choice.from?.trim() || null;
  const secret = choice.secret?.trim() || undefined;
  const fieldErrors: FieldError[] = [];
  if (from === null) {
    fieldErrors.push({ field: "from", code: "required" });
  } else if (!z.email().safeParse(from).success) {
    fieldErrors.push({ field: "from", code: "invalid" });
  }
  if (secret === undefined && (saved.source !== choice.source || !saved.hasSecret)) {
    fieldErrors.push({ field: "secret", code: "required" });
  } else if (secret !== undefined && choice.source === "smtp_server" && !isSmtpUrl(secret)) {
    fieldErrors.push({ field: "secret", code: "invalid" });
  }
  if (fieldErrors.length > 0) {
    throw invalidInput(fieldErrors);
  }
  return { source: choice.source, from, secret };
}

function isSmtpUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return (url.protocol === "smtp:" || url.protocol === "smtps:") && url.hostname !== "";
  } catch {
    return false;
  }
}
