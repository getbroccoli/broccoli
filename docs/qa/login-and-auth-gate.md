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

## Logout

- [ ] The workspace menu shows "Signed in as …" and "Sign out".
- [ ] "Sign out" lands on `/login?redirect=…` for the current page; Back does not show the previous page.

## Session ends elsewhere

- [ ] Sign out in a second tab, then search in the first: it goes to login, and signing in returns to the same search.

## Robustness

- [ ] With the API stopped, a reload shows "Couldn’t reach Broccoli"; once it is back, "Try again" opens the page.
- [ ] An unknown path such as `/foo` shows "Page not found" with "Go to People".
- [ ] At a narrow width the login card fits the screen with its side margin.
