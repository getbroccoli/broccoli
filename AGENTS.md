# Instructions for coding agents

- Follow `docs/architecture.md`. Propose a change to it in the same pull request when a change needs one.
- Follow `docs/testing.md` when writing or changing tests.
- A folder of related code is a module with a narrow contract: its `index.ts` lists everything it offers with explicit named exports (no `export *`). Code outside the folder imports only from that `index.ts`, never from the folder's other files.
- Commit titles use Conventional Commits. Pull requests are squash-merged.
- Nothing internal: no secrets, no `.env` files, no internal URLs.
