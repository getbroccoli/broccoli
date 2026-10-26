import type { TemplateValues } from "./mailer";

/** One template's email as plain text and simple HTML; values are escaped in the HTML. */
export function renderTemplate(message: TemplateValues): {
  subject: string;
  text: string;
  html: string;
} {
  switch (message.template) {
    case "password_reset": {
      const { resetLink } = message.values;
      return {
        subject: "Reset your Broccoli password",
        text: [
          "Someone asked to reset the password of your Broccoli account.",
          `Choose a new password: ${resetLink}`,
          "The link works once, for one hour. If it wasn't you, ignore this email.",
        ].join("\n\n"),
        html: [
          paragraph("Someone asked to reset the password of your Broccoli account."),
          `<p><a href="${escapeHtml(resetLink)}">Choose a new password</a></p>`,
          paragraph("The link works once, for one hour. If it wasn't you, ignore this email."),
        ].join("\n"),
      };
    }
    case "test_email": {
      const body = "This test email shows that Broccoli can send email with your settings.";
      return { subject: "Broccoli can send email", text: body, html: paragraph(body) };
    }
  }
}

function paragraph(text: string): string {
  return `<p>${escapeHtml(text)}</p>`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
