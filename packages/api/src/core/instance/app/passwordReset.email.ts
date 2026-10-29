import type { EmailTemplate } from "../../../integrations/mail";

/** The password reset email, linking to the reset page. */
export const PASSWORD_RESET_TEMPLATE: EmailTemplate<{ resetLink: string; recipient: string }> = {
  name: "password_reset",
  render: ({ resetLink, recipient }) => ({
    subject: "Reset your Broccoli password",
    blocks: [
      { type: "heading", text: "Reset your password" },
      { type: "paragraph", text: "Someone asked to reset your Broccoli password." },
      {
        type: "button",
        label: "Choose a new password",
        link: resetLink,
        hint: "Link expires in 1 hour. Didn't ask? Ignore this email.",
      },
      { type: "pasteLink", link: resetLink },
    ],
    footer: `Sent to ${recipient}.`,
  }),
};
