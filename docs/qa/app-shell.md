# QA: App frame and menus

A manual check of the left menu, the company menu, Settings and the profile menu, against a development stack.

## Setup

1. Start the stack and create the owner with the demo company as in [QA setup](setup.md).
2. Sign in as `owner@example.com`.

## App menu

- [ ] The left menu shows the company menu at the top, "People" below it and the profile button at the bottom.
- [ ] The company menu opens with the company's logo and name, then "Settings"; with demo data, "Exit demo" under "Demo"; without it, "Reset setup".

## Settings

- [ ] "Settings" in the company menu opens `/settings/email`: the left menu slides to the settings menu, the backdrop turns a shade darker and the page card takes a deeper shadow.
- [ ] The settings menu shows "Back to app", "Settings", "Workspace", "Email" and "Locations", with the profile button at the bottom; the open section is highlighted.
- [ ] `/settings` opens `/settings/email`; "Locations" opens `/settings/locations`.
- [ ] "Back to app" slides back and opens People.
- [ ] With the system's reduce motion setting on, the menus swap without sliding.
- [ ] Tab never reaches the menu that is out of view.
- [ ] Signed in as an employee who is not an admin, the company menu has no "Settings", and `/settings` redirects to People.

## Profile menu

- [ ] As the owner, the profile button shows initials and the email; the menu opens upward with the email, "My profile" and "Sign out". "My profile" opens People.
- [ ] As an employee, the button shows their photo or initials, name and job title; the menu adds their email under the name, and "My profile" opens their panel.
- [ ] In the demo without an account, the menu has no "Sign out".

## Narrow screens

- [ ] At 390 px wide, the menu sits above the page in one row with the profile button as an avatar only; Settings swaps the row to "Back to app", "Email" and "Locations".
