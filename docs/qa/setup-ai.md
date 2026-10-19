# QA: Setup AI

A manual check of how a self-hosted owner picks the way Broccoli reads their files, on a development stack.

## Setup

1. Run `pnpm dev` with a fresh development database and follow [setup](setup.md) up to and including naming the company.
2. For the OpenRouter cases, have an OpenRouter API key. For the environment case, restart with `OPENROUTER_API_KEY` set.

## The page

- [ ] Saving the company opens `/setup/ai`, titled "Setup AI". The sidebar shows "Setup Company" done, "Setup AI" current, then "Add your people" and "Create your account".
- [ ] The green line reads "We don’t send private data from your documents to any model."
- [ ] Without `OPENROUTER_API_KEY`, "Broccoli AI" is selected. "Your agent" is greyed out with "Coming soon" and cannot be selected, by mouse or keyboard.
- [ ] The privacy line sits under the options, and the "Demo data" card under it with "Use demo data".
- [ ] The footer holds only "Next: gather everyone’s details".

## Broccoli AI

- [ ] "Next" shows "Checking…", then opens `/setup/import`; the sidebar shows "Setup AI" done.
- [ ] Upload a staff CSV: it is read ("N people").
- [ ] With the relay unreachable (`SELF_HOSTED_BROCCOLI_AI_URL` pointing at a closed local port), "Next" stays on the page with "Broccoli AI is busy right now. Try again in a few minutes, or use your own OpenRouter key."

## OpenRouter

- [ ] Selecting "OpenRouter" shows "API key" (a password field, placeholder `sk-or-v1-...`) and "No key yet? Create a key", which opens OpenRouter's keys page in a new tab. "Next" is disabled while the field is empty.
- [ ] A wrong key shows "OpenRouter didn’t accept this key. Check it and try again." under the field; nothing is saved.
- [ ] A working key opens `/setup/import`; a CSV is read through OpenRouter. Going back to `/setup/ai` shows OpenRouter selected with "Key saved" and "Replace".
- [ ] With `OPENROUTER_API_KEY` set on a fresh instance, OpenRouter is selected with "Using OPENROUTER_API_KEY from your .env file." and "Key found in .env"; "Replace" swaps it for the key field.
- [ ] With `OPENROUTER_API_KEY` set, choosing "Broccoli AI" and "Next" reads files through Broccoli AI.

## Demo data

- [ ] "Use demo data" shows "Filling demo data…" and opens "Create your account"; after it, `/people` shows the 40 demo people.

## File refusals

- [ ] A file Broccoli AI refuses because its free period is over shows "Your free Broccoli AI period is over. Add your own OpenRouter key to keep reading files." and "Use your own key", which opens `/setup/ai`.

## Managed

- [ ] A managed instance goes from "Setup Company" to `/setup/import`; its sidebar has no "Setup AI", and `/setup/ai` redirects to `/setup/import`.
