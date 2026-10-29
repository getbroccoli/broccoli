import { type EmailTemplate, emailLayout } from "../../../integrations/mail";

/** The password reset email, linking to the reset page. */
export const PASSWORD_RESET_TEMPLATE: EmailTemplate<{ resetLink: string; recipient: string }> = {
  name: "password_reset",
  render: ({ resetLink, recipient }) => {
    const heading = "Reset your password";
    const intro = "Someone asked to reset your Broccoli password.";
    const action = "Choose a new password";
    const expiry = "Link expires in 1 hour. Didn't ask? Ignore this email.";
    const footer = `Sent to ${recipient}.`;
    return {
      subject: "Reset your Broccoli password",
      text: [intro, `${action}: ${resetLink}`, expiry, footer].join("\n\n"),
      html: emailLayout.page({
        origin: new URL(resetLink).origin,
        content: [
          emailLayout.heading(heading),
          emailLayout.paragraph(intro),
          emailLayout.button(action, resetLink, expiry),
          emailLayout.pasteLink(resetLink),
        ].join(""),
        footer,
      }),
    };
  },
};
