# QA: Setup AI

A manual check of how a self-hosted owner picks the way Broccoli reads their files, on a development stack.

## Setup

1. Run `pnpm dev` with a fresh development database and follow [setup](setup.md) up to and including naming the company.
2. For the OpenRouter cases, have an OpenRouter API key. For the environment case, restart with `OPENROUTER_API_KEY` set.

## The page

- [ ] Saving the company opens `/setup/ai`, titled "Setup AI". The sidebar shows "Setup Company" done, "Setup AI" current, then "Add your people" and "Create your account".
- [ ] The green line reads "We don’t send private data from your documents to any model."
- [ ] Without `OPENROUTER_API_KEY`, "Broccoli AI" is selected. "Your agent" is greyed out with "Coming soon" and cannot be selected, by mouse or keyboard.
- [ ] The privacy line sits under the options, and the "Demo data" card under it with "Explore the demo".
- [ ] The footer holds "Back" on the left and "Continue" on the right, on desktop and narrow windows.
- [ ] "Back" opens `/setup/company` with the saved name and logo. Edit the name and choose "Continue": setup returns to AI with the new company name in the sidebar. Saved AI settings and gathered people stay.
- [ ] "Back" remains available while AI settings load or fail to load, and while an empty OpenRouter key disables "Continue". It is disabled while connecting, checking a key or opening the demo.

## Stale generated code (development only)

- [ ] Temporarily rename the `ChooseAiDocument` export in `packages/web/src/__generated__/graphql.ts`, then reload `/setup/ai`. The error card says "Generated GraphQL code is out of date" and asks for `pnpm codegen`.
- [ ] Run `pnpm --filter @broccoli/web codegen`, then choose "Reload page". Setup AI loads again.

## Broccoli AI

- [ ] "Continue" shows "Connecting…", then opens `/setup/import`; the sidebar shows "Setup AI" done.
- [ ] Upload a staff CSV: it is read ("N people").
- [ ] With the relay unreachable (`SELF_HOSTED_BROCCOLI_AI_URL` pointing at a closed local port), "Continue" stays on the page with "Broccoli AI is busy right now. Try again in a few minutes, or use your own OpenRouter key."

- [ ] When the relay refuses a token with `free_period_used`, setup says a trial was already issued for this network and this installation cannot access it; it does not claim the trial expired. The same reason on a file gives the same explanation.
- [ ] After a successful Broccoli AI connection, reset only a throwaway development database with `pnpm dev --drop-db`, keeping `.data`. Set up the company again: Broccoli AI reuses the same trial token. The trial’s expiry and allowance do not reset.

## OpenRouter

- [ ] Selecting "OpenRouter" shows "API key" (a password field, placeholder `sk-or-v1-...`) and "No key yet? Create a key", which opens OpenRouter's keys page in a new tab. "Continue" is disabled while the field is empty.
- [ ] "Continue" shows "Checking your key…". A wrong key shows "OpenRouter didn’t accept this key. Check it and try again." under the field; nothing is saved.
- [ ] A working key opens `/setup/import`; a CSV is read through OpenRouter. Going back to `/setup/ai` shows OpenRouter selected with "Key saved" and "Replace".
- [ ] With `OPENROUTER_API_KEY` set on a fresh instance, OpenRouter is selected with "Using OPENROUTER_API_KEY from your .env file." and "Key found in .env"; "Replace" swaps it for the key field.
- [ ] With `OPENROUTER_API_KEY` set, choosing "Broccoli AI" and "Continue" reads files through Broccoli AI.
- [ ] With an invalid `OPENROUTER_API_KEY`, "Continue" without Replace stays on the page and shows "OpenRouter didn’t accept this key. Check it and try again." under the options.

## Demo data

- [ ] "Explore the demo" shows "Opening the demo…" and opens `/people` with the 40 demo people, signed in as the demo's owner, without asking for an account.

## File refusals

- [ ] A file Broccoli AI refuses because its free period is over shows "Your free Broccoli AI period is over. Add your own OpenRouter key to keep reading files." and "Use your own key", which opens `/setup/ai`.

## Managed

- [ ] A managed instance goes from "Setup Company" to `/setup/import`; its sidebar has no "Setup AI", and `/setup/ai` redirects to `/setup/import`.
