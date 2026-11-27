# QA: Act as another employee

A manual check of acting as someone from their panel, the banner, and stopping, against a development stack.

## Setup

1. Start the stack as in [QA setup](setup.md) and choose "Explore the demo", which signs you in as the demo's owner.
2. For the manager checks, use an instance with an owner account: add a manager and their direct report as in [QA setup](setup.md), invite the manager as [Invites](invites.md) shows, and sign in as them in a second browser.

## Start

- [ ] In People, a person's ⋯ menu shows "Act as <name>" first. Your own panel never shows it.
- [ ] "Act as" opens Today greeting that person, with a dark bar across the top: "Acting as <name>" and "Stop acting as". The bar stays put while the page scrolls, and wraps on a phone.
- [ ] Tasks, Time off and the profile menu are that person's. Requesting time off as them shows "N days requested."

## While acting

- [ ] The ⋯ menu of other people shows no "Act as", no invite actions and no Remove; the panel offers no Permissions change.
- [ ] Your agent says to stop acting first, with no connection steps; an agent's Allow page opens Today instead.
- [ ] The profile menu shows the person's name without your sign-in email.
- [ ] In the demo, the green banner still counts down the demo's days, and the profile menu offers no Sign out.
- [ ] Before acting, with an unsaved edit in someone's panel, "Act as" in its ⋯ menu first asks to discard it. "Keep editing" leaves you yourself, also after you open Today later; "Discard" starts acting.
- [ ] With a second tab open, starting or stopping in one reloads the other. If that tab keeps an unsaved edit, it can neither read nor save anything until reloaded.

## Stop

- [ ] "Stop acting as" opens your own Today, the bar is gone, and Tasks shows the approval of the request made as them, named after them.
- [ ] Their panel lists the request as theirs, waiting for approval.

## Who may

- [ ] A manager's ⋯ menu offers "Act as" for a direct report, never for someone further down, a colleague, their own manager, or a report who is an admin.
- [ ] An admin's menu offers it for everyone but themselves and the owner's person.
