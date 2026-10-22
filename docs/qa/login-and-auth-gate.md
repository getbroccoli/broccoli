# QA: Login, logout and the auth gate

A manual check of signing in and out against a development stack.

## Setup

1. Start the stack and create the owner as in [QA setup](setup.md).
2. Use a fresh browser profile, so no session cookie is left over.

## Login

- [ ] `/people?q=a` lands on `/login?redirect=%2Fpeople%3Fq%3Da`, shown without the navigation.
- [ ] Submitting empty fields shows "Enter a valid email address." and "Enter your password."
- [ ] A wrong password shows "The email or password is incorrect." and keeps the email.
- [ ] The right password returns to `/people?q=a`.
- [ ] `/login` while signed in goes to `/people`; `/login?redirect=https://example.com` goes to `/people` after signing in.

## Managed sign-in by method

On a managed workspace created through the website (with the QA mock providers):

- [ ] Created with email: after signing out, `/login` shows only "Sign in with email", without the hint. It leads to "Sign back in to your workspace" with no email field; "Send me a link" sends the link to the owner's address, and opening it signs back in as the owner. "Set up Broccoli for free" never shows.
- [ ] Created with Google: after signing out, `/login` shows only "Continue with Google", and it signs back in as the owner.
- [ ] An instance whose owner has not signed in since this change shows both buttons and the hint; after the owner's next sign-in it shows only theirs.

## Logout

- [ ] The workspace menu shows "Signed in as …" and "Sign out".
- [ ] "Sign out" lands on `/login?redirect=…` for the current page; Back does not show the previous page.

## Session ends elsewhere

- [ ] Sign out in a second tab, then search in the first: it goes to login, and signing in returns to the same search.

## Robustness

- [ ] With the API stopped, a reload shows "Couldn’t reach Broccoli"; once it is back, "Try again" opens the page.
- [ ] An unknown path such as `/foo` shows "Page not found" with "Go to People".
- [ ] At a narrow width the login card fits the screen with its side margin.
