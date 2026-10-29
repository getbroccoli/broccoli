# QA: Email settings and password reset

A manual check of how a self-hosted instance sends email, and of resetting a forgotten password, against a development stack.

## Setup

1. Start the stack and create the owner `owner@example.com` with a password as in [QA setup](setup.md). `pnpm dev` also prints the Mailpit address, where the email it sends arrives.
2. Use a second browser profile for the signed-out checks.

## Settings page

- [ ] The navigation shows "Settings" under "People"; it opens `/settings` with the "Email" section and the saved mail choice selected.
- [ ] "Your mail server (SMTP)" shows the SMTP URL and From address fields; "Resend" shows the API key and From address fields; "No email" shows none.
- [ ] Under `pnpm dev`, a fresh instance opens with SMTP selected, `people@example.com`, and its URL shown as "Saved" with Replace. "Send me a test email" is available immediately, without saving first.
- [ ] After Replace, entering `smtp://mailpit:1025` and choosing "Check and save" shows "Checking…", then "Email settings saved"; the URL field becomes "Saved" with Replace.
- [ ] A reload keeps the choice and From, and never shows the URL.
- [ ] `smtp://nowhere.invalid:25` shows "Your mail server could not be reached…"; `https://smtp.example.com` shows "Enter a URL that starts with smtp:// or smtps://."; a From without `@` shows "Enter an email address…". Each time the earlier choice stays.
- [ ] Switching from a saved SMTP server to Resend asks for the API key: saving without one shows "Enter your Resend API key."
- [ ] After Replace, typing an SMTP URL and then choosing Resend shows an empty API key field; choosing SMTP again shows "Saved".
- [ ] An SMTP URL with a query, such as `smtp://mailpit:1025?pool=true`, shows "Enter a URL that starts with smtp:// or smtps://."
- [ ] "Send me a test email" shows "Test email sent to owner@example.com", and Mailpit receives "Broccoli can send email" from "Broccoli" <people@example.com>.
- [ ] With Resend and a made-up key, "Send me a test email" shows "The test email was not sent:" with Resend's reason.
- [ ] Saving "No email" hides "Send me a test email".
- [ ] Restarting `pnpm dev` keeps a saved "No email", Resend or custom SMTP choice. With Mailpit chosen, links in new emails use the new development port.

## Forgot password

- [ ] With "No email" saved, `/login` shows no "Forgot password?".
- [ ] With the SMTP server saved, `/login` shows "Forgot password?" next to Password; it opens `/forgot-password`.
- [ ] `owner@example.com` shows "If that address has an account, we sent a link…", and Mailpit receives "Reset your Broccoli password" within seconds.
- [ ] `nobody@example.com` shows the same answer, and Mailpit receives nothing.
- [ ] A sixth request within a minute shows "Too many attempts. Try again in a moment."

## Reset password

- [ ] The link in the email opens `/reset-password`, and the token disappears from the address bar.
- [ ] A password shorter than 8 characters shows "Use at least 8 characters."
- [ ] "Change password" lands on `/login` with "Your password is changed…"; the old password fails, the new one signs in.
- [ ] The browser that was signed in before the reset is signed out on its next page.
- [ ] Opening the same link again and choosing a password shows "This link is no longer valid…" with "Get a new link".
- [ ] `/reset-password` without a token shows "This link is no longer valid…" at once.

## Demo owner

- [ ] During the self-hosted demo (no password), with the SMTP server saved, asking for a reset of the demo owner's address sends nothing to Mailpit.
