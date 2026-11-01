# QA: Who uses Broccoli

A manual check of the "Who uses Broccoli" setup page and the invites setup's last page sends, on both modes, against a development stack.

## Setup

1. Start the stack as in [QA setup](setup.md) and go through setup to the review with a staff file of four people: `owner@example.com` (Avery Stone), `robin@example.com`, managed by Avery, `taylor@example.com`, managed by Robin, and `casey@example.com`, managed by nobody.
2. For links, save "No email" in Settings on a finished instance first, or check links on a fresh self-hosted instance whose mail is not set.

## The page

- [ ] Approve lands on "Who uses Broccoli", the step after "Add your people" in the step list; Back reopens the review.
- [ ] On managed, signed in as `owner@example.com`, "Which of these people are you?" already shows Avery Stone. On self-hosted it shows "I’m not in the list".
- [ ] Change opens a search over the people being added; picking Avery shows Avery, and "No one" shows "I’m not in the list".
- [ ] "Only admins" is chosen. With Avery chosen as you, "Admins and managers" says "You and the 1 person who manages someone…" and Show names lists only Robin; "Everyone" says "You and all 3 people…".
- [ ] Choosing "I’m not in the list", continuing and pressing Back keeps "I’m not in the list"; choosing Robin, continuing and pressing Back keeps Robin.
- [ ] With nobody but the owner managing anyone, "Admins and managers" is disabled and says "Nobody besides you manages anyone yet…".

## The last page

- [ ] With "Only admins", the last page is as before: "Create account" or "Start using Broccoli", no invite section.
- [ ] With "Admins and managers", the page shows "1 person gets an invite" (Robin) with Show names, the preview ("You’re invited to Acme Corp on Broccoli", "Hi Robin,", "Join Acme Corp", "The link works once, for 7 days."), and the button "Create account and send 1 invite" or "Finish and send 1 invite".
- [ ] Back returns to "Who uses Broccoli" with the same answers.
- [ ] On self-hosted, the email field is pre-filled with the chosen person's work email.
- [ ] By email: the note field shows; a note typed there shows in the preview. On managed, a note with `https://…` is refused with "Links can't go in the note…", and nothing is added: the page stays, and pressing again without the link finishes.
- [ ] Finishing by email lands on People with "Invite sent" and Mailpit receives the invite, signed by the owner.
- [ ] Without email, the button says "create N invite links"; finishing shows the links dialog (Copy link, "Copy all as a list", Done) and Done lands on People.

## After setup

- [ ] On People, the owner's person (Avery) shows Joined; the invited people show Pending; the others show Not invited.
- [ ] Avery's panel has no Delete; the owner sees themself as their person on "Your profile".
- [ ] "Only admins" left everyone but the owner's person Not invited.
