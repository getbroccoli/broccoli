import type { EmailTemplate } from "../../../integrations/mail";

/** The email that checks the chosen mail settings. */
export const TEST_EMAIL_TEMPLATE: EmailTemplate<{ recipient: string }> = {
  name: "test_email",
  render: ({ recipient }) => ({
    subject: "Broccoli can send email",
    blocks: [
      { type: "heading", text: "Broccoli can send email" },
      {
        type: "paragraph",
        text: "This test email shows that Broccoli can send email with your settings.",
      },
    ],
    footer: `Sent to ${recipient}.`,
  }),
};
