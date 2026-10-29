import type { EmailTemplate } from "../../../../integrations/mail";

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
    return {
      subject: `${invited} on Broccoli`,
      blocks: [
        { type: "company", name: companyName },
        { type: "heading", text: invited },
        { type: "paragraph", text: "Join to see your profile, time off and team." },
        ...(note ? [{ type: "note" as const, text: note, author: inviterName }] : []),
        {
          type: "button",
          label: `Join ${companyName}`,
          link,
          hint: `Link expires ${formatDay(expiresAt)}.`,
        },
        { type: "pasteLink", link },
      ],
      footer: `Sent to ${recipient}. Not expecting this? Ignore it.`,
    };
  },
};

function formatDay(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}
