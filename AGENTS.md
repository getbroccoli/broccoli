# Instructions for coding agents

- Follow `docs/architecture.md`. Propose a change to it in the same pull request when a change needs one.
- Follow `docs/testing.md` when writing or changing tests.
- A folder of related code is a module with a narrow contract: its `index.ts` lists everything it offers with explicit named exports (no `export *`). Code outside the folder imports the folder itself (`./db`), never the folder's other files. Relative imports carry no file extension. The exceptions are `packages/web/src/components/ui/*` and `packages/web/src/lib/class-names`, which the shadcn CLI generates and imports by path.
- Commit titles use Conventional Commits. Pull requests are squash-merged.
- Nothing internal: no secrets, no `.env` files, no internal URLs.
