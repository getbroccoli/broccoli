# QA: Today

A manual check of the home page and its invitation to connect your own agent, against a development stack.

## Setup

1. Start the stack with `pnpm dev --drop-db`.
2. Keep a second browser profile ready for "Every browser".

## Landing

- [ ] Finishing self-hosted setup ("Create account", see [QA setup](setup.md)) ends on Today (`/`), with "Today" highlighted first in the menu.
- [ ] Finishing managed setup ("Start using Broccoli" on `/setup/ready`) ends on Today.
- [ ] Signing out and in again without a `redirect` ends on Today.
- [ ] The title reads "Good morning, {first name}", "Good afternoon, …" or "Good evening, …" by the computer's clock (before 12:00, before 18:00, after), with "Here's what's new today." under it. An owner without an employee record reads "Good morning" with no name.

## The invitation

- [ ] Without an agent connected, the card "Ask your own Claude or ChatGPT" shows under the title, saying the agent can look you up and find people, reads only what you can and never approves anything. Nothing about time off, tasks or approvals.
- [ ] Reloading shows the card without first flashing "Nothing new today.", and vice versa once closed.
- [ ] "Connect your agent" opens Your agent.
- [ ] Connect an agent as in [QA: Connect your own agent](connect-your-agent.md), then open Today: no card, and "Nothing new today." with "See your tasks", which opens `/tasks`.
- [ ] Disconnect on Your agent, then open Today: the card is back.

## Closing

- [ ] The X closes the card at once; "Nothing new today." takes its place.
- [ ] Closing with the keyboard (Tab to the X, Enter) moves focus to the page title.
- [ ] Reloading keeps it closed.
- [ ] Signed in as the same person in the second browser profile, Today shows no card.
- [ ] Another person (an invited employee) still sees their own card.
- [ ] Connecting and disconnecting an agent after closing doesn't bring the card back.
- [ ] With the API stopped, closing shows "Couldn't close the invitation. Try again." and the card comes back.

## Phone width and motion

- [ ] At 390 px wide, the card stacks: icon and text on top, "Connect your agent" full width below, the X in the top right corner; nothing overflows.
- [ ] With the system's reduce motion setting on, the card appears without fading in.
