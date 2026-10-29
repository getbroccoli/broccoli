import { type EmailTemplate, escapeHtml } from "../../../integrations/mail";

/** The email that checks the chosen mail settings. */
export const TEST_EMAIL_TEMPLATE: EmailTemplate<Record<string, never>> = {
  name: "test_email",
  render: () => {
    const body = "This test email shows that Broccoli can send email with your settings.";
    return { subject: "Broccoli can send email", text: body, html: `<p>${escapeHtml(body)}</p>` };
  },
};
