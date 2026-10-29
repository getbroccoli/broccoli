import { type EmailTemplate, emailLayout } from "../../../integrations/mail";

/** The email that checks the chosen mail settings. */
export const TEST_EMAIL_TEMPLATE: EmailTemplate<{ origin: string; recipient: string }> = {
  name: "test_email",
  render: ({ origin, recipient }) => {
    const heading = "Broccoli can send email";
    const body = "This test email shows that Broccoli can send email with your settings.";
    const footer = `Sent to ${recipient}.`;
    return {
      subject: heading,
      text: [body, footer].join("\n\n"),
      html: emailLayout.page({
        origin,
        content: emailLayout.heading(heading) + emailLayout.paragraph(body),
        footer,
      }),
    };
  },
};
