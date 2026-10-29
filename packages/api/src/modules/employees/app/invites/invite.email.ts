import { type EmailTemplate, escapeHtml } from "../../../../integrations/mail";

/** What the invite email says. */
export interface InviteEmailValues {
  firstName: string;
  /** The inviter's name; null when their account has none, as the owner's may not. */
  inviterName: string | null;
  companyName: string;
  note: string | null;
  link: string;
  expiresAt: Date;
}

export const INVITE_TEMPLATE: EmailTemplate<InviteEmailValues> = {
  name: "invite",
  render: ({ firstName, inviterName, companyName, note, link, expiresAt }) => {
    const subject = inviterName
      ? `${inviterName} invited you to ${companyName} on Broccoli`
      : `You're invited to ${companyName} on Broccoli`;
    const greeting = `Hi ${firstName}, ${inviterName ? `${inviterName} invited you` : "you're invited"} to ${companyName} on Broccoli.`;
    const join = `Join ${companyName}`;
    const expiry = `The link works once, until ${formatDay(expiresAt)}.`;
    const questions = inviterName && `Questions? Ask ${inviterName} directly.`;
    return {
      subject,
      text: [greeting, note && `"${note}"`, `${join}: ${link}`, expiry, questions]
        .filter((part) => part)
        .join("\n\n"),
      html: [
        `<p>${escapeHtml(greeting)}</p>`,
        note && `<blockquote>${escapeHtml(note)}</blockquote>`,
        `<p><a href="${escapeHtml(link)}">${escapeHtml(join)}</a></p>`,
        `<p>${escapeHtml(expiry)}</p>`,
        questions && `<p>${escapeHtml(questions)}</p>`,
      ]
        .filter((part) => part)
        .join("\n"),
    };
  },
};

function formatDay(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}
