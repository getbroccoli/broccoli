# QA: Company step

A manual check of naming the company and adding its logo in the browser, on a development stack.

## Setup

1. Run `pnpm dev --drop-db` to start on a database without an owner.
2. Open the app in a fresh browser profile; it holds setup and opens `/setup/company`.

## Name

- [ ] The page is `/setup/company`, with "Setup Company" current.
- [ ] The name field is empty and "Continue" is disabled: there is no owner email to suggest a name from yet.
- [ ] A blank name keeps the button disabled; 101 characters show "Use at most 100 characters." after submitting.

## Logo

- [ ] Choosing a PNG shows it in the preview; choosing a JPEG replaces it; the remove button brings back the placeholder.
- [ ] A file over 5 MB, and an SVG renamed to `.png`, show "Choose a PNG, JPG or WebP image up to 5 MB."; the previous logo stays.
- [ ] After a reload the uploaded logo is still there.
- [ ] A logo photo of several MB (just under 5 MB) uploads, shows at once and stays sharp in the preview, the sidebar and the ring around the added people; the network tab shows the logo as a WebP of a few KB.

## Saving

- [ ] After saving, the sidebar shows the company's name and logo instead of "Your workspace" and the plant; removing the logo brings the plant back.
- [ ] A 100-character name, and one long word without spaces, end in "…" in the sidebar on desktop and narrow windows; hovering shows the whole name.
- [ ] "Continue" lands on `/setup/ai`, with "Setup Company" done and "Setup AI" current. Before approving the import, "Back" from AI reopens `/setup/company` with the saved details; saving again returns to AI.
- [ ] Before saving, a second browser profile lands on `/setup/in-progress`.

## Layout

- [ ] On a narrow window the logo sits above the name field, and nothing scrolls sideways.
- [ ] Screenshots of `/setup/company` (desktop and narrow; suggested name; with a logo; with an error) go in the pull request description.
