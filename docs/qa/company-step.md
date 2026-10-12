# QA: Company step

A manual check of naming the company and adding its logo in the browser, on a development stack.

## Setup

1. Run `pnpm dev` on a database without an owner (remove the development database volume, or use a fresh checkout).
2. On `/setup`, create the owner with `owner@acme-corp.example`.

## Name

- [ ] The page is `/setup/company`, with "Setup Workspace" done and "Setup Company" current.
- [ ] The name field shows "Acme Corp". With a `gmail.com` owner it is empty and "Save and continue" is disabled.
- [ ] A blank name keeps the button disabled; 101 characters show "Use at most 100 characters." after submitting.

## Logo

- [ ] Choosing a PNG shows it in the preview; choosing a JPEG replaces it; the remove button brings back the placeholder.
- [ ] A file over 5 MB, and an SVG renamed to `.png`, show "Choose a PNG, JPG or WebP image up to 5 MB."; the previous logo stays.
- [ ] After a reload the uploaded logo is still there.

## Saving

- [ ] "Save and continue" lands on `/people` in the app. `/setup/company` now goes to `/people`.
- [ ] Before saving, signing in as the owner in a second browser profile lands on `/setup/company`.

## Layout

- [ ] On a narrow window the logo sits above the name field, and nothing scrolls sideways.
- [ ] Screenshots of `/setup/company` (desktop and narrow; suggested name; with a logo; with an error) go in the pull request description.
