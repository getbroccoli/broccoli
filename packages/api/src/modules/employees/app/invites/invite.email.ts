import { type EmailTemplate, emailLayout } from "../../../../integrations/mail";

/** What the invite email says. */
export interface InviteEmailValues {
  /** The address the invite goes to, named in the footer. */
  recipient: string;
  /** The inviter's name; null when their account has none, as the owner's may not. */
  inviterName: string | null;
  companyName: string;
  note: string | null;
  link: string;
  expiresAt: Date;
}

export const INVITE_TEMPLATE: EmailTemplate<InviteEmailValues> = {
  name: "invite",
  render: ({ recipient, inviterName, companyName, note, link, expiresAt }) => {
    const invited = inviterName
      ? `${inviterName} invited you to ${companyName}`
      : `You're invited to ${companyName}`;
    const lead = "Join to see your profile, time off and team.";
    const join = `Join ${companyName}`;
    const expiry = `Link expires ${formatDay(expiresAt)}.`;
    const footer = `Sent to ${recipient}. Not expecting this? Ignore it.`;
    return {
      subject: `${invited} on Broccoli`,
      text: [
        `${invited}.`,
        lead,
        note && `"${note}"${inviterName ? ` (${inviterName})` : ""}`,
        `${join}: ${link}`,
        expiry,
        footer,
      ]
        .filter((part) => part)
        .join("\n\n"),
      html: emailLayout.page({
        origin: new URL(link).origin,
        content: [
          emailLayout.company(companyName),
          emailLayout.heading(invited),
          emailLayout.paragraph(lead),
          note ? emailLayout.note(note, inviterName) : "",
          emailLayout.button(join, link, expiry),
          emailLayout.pasteLink(link),
        ].join(""),
        footer,
      }),
    };
  },
};

function formatDay(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}
