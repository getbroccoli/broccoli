import { type EmailTemplate, escapeHtml } from "../../../integrations/mail";

/** The password reset email, linking to the reset page. */
export const PASSWORD_RESET_TEMPLATE: EmailTemplate<{ resetLink: string }> = {
  name: "password_reset",
  render: ({ resetLink }) => {
    const intro = "Someone asked to reset the password of your Broccoli account.";
    const expiry = "The link works once, for one hour. If it wasn't you, ignore this email.";
    return {
      subject: "Reset your Broccoli password",
      text: [intro, `Choose a new password: ${resetLink}`, expiry].join("\n\n"),
      html: [
        `<p>${escapeHtml(intro)}</p>`,
        `<p><a href="${escapeHtml(resetLink)}">Choose a new password</a></p>`,
        `<p>${escapeHtml(expiry)}</p>`,
      ].join("\n"),
    };
  },
};
