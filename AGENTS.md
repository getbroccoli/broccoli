# Instructions for coding agents

- Follow YAGNI, KISS and DRY: build only what the task needs, choose the simplest design that works, and keep each piece of knowledge in one place.
- Follow `docs/architecture.md`. Propose a change to it in the same pull request when a change needs one.
- Follow `docs/testing.md` when writing or changing tests.
- A folder of related code is a module with a narrow contract: its `index.ts` lists everything it offers with explicit named exports (no `export *`). Code outside the folder imports the folder itself (`./db`), never the folder's other files. Relative imports carry no file extension. The exceptions are `packages/web/src/components/ui/*` and `packages/web/src/lib/class-names`, which the shadcn CLI generates and imports by path. Generated code in `packages/web/src/__generated__` is imported by path too. Tests import the shared test support as `#test/support`, a subpath import declared in `packages/api/package.json`.
- Files and folders are camelCase (`useCases/getCompany.ts`, `useListPage.ts`); React components and the folders named after them are PascalCase (`OwnerSetupForm.tsx`, `SetupLayout/`). Suffixes keep their dots (`getCompany.int.test.ts`). Tools name their own files: route files (their names are URLs), the shadcn CLI's kebab-case files, generated code and migrations. ESLint enforces this with `eslint-plugin-check-file`. Make a case-only rename through a temporary name, because case-insensitive file systems miss it.
- One React component per file. A component built from smaller components of its own is a folder named after it (`features/setup/SetupLayout/`), with each component in its own file and `index.ts` exporting only what the rest of the code uses.
- Commit titles use Conventional Commits. Pull requests are squash-merged.
- Parse, don't validate: turn raw input into a typed value once, at the boundary (`parseCalendarDate`, `parseNewEmployee`, `parsePage`), and pass that value on. Never check with an `isX` function and then keep using the raw input.
- Prefer zero-config solutions and modules: they work without setup, and every setting has a safe default.
- Nothing internal: no secrets, no `.env` files, no internal URLs.
