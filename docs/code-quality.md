# Code quality

The rules every change is checked against. Each rule is stated here and nowhere else; `architecture.md` and `testing.md` hold the decisions and reasons behind them and link here by ID. An ID is never reused: a removed rule leaves its number retired.

Each rule ends with how it is enforced: `lint: <rule>` and `tsc` fail `pnpm check`; `review` is checked by the author before review and by the reviewer. A review comment cites the ID. A rule is added only for a theme that keeps coming back in review, and only once the maintainer agrees; a `review` rule that keeps coming back becomes a lint rule where a tool can judge it.

## Modules and files

- **Q1.** A folder of related code is a module: its `index.ts` lists what other code uses, and nothing more, with explicit named exports, never `export *`. `lint: no-restricted-syntax`
- **Q2.** Code outside a folder imports the folder itself (`./db`), never its other files, and relative imports carry no file extension. The exceptions are imported by path: `packages/web/src/components/ui/*` and `packages/web/src/lib/class-names`, which the shadcn CLI generates, and generated code in `packages/web/src/__generated__`. Tests import the shared test support as `#test/support`. `lint: boundaries`
- **Q3.** A folder imports only what its package's `importRules.json` lists; a new module, or a new import between modules, is added there ([architecture](architecture.md#layout-of-the-api)). `lint: boundaries`
- **Q4.** Files and folders are camelCase (`useCases/getCompany.ts`); React components and the folders named after them are PascalCase (`OwnerSetupForm.tsx`, `SetupLayout/`). Suffixes keep their dots (`getCompany.int.test.ts`). Tools name their own files: route files (their names are URLs), the shadcn CLI's kebab-case files, generated code and migrations. Make a case-only rename through a temporary name, because case-insensitive file systems miss it. `lint: check-file`
- **Q5.** A file is named after the main thing it exports (`TestSecurityContext` in `testSecurityContext.ts`), not after a group. `review`
- **Q6.** One React component per file. A component built from smaller components of its own is a folder named after it (`features/setup/SetupLayout/`), each component in its own file and `index.ts` exporting only what the rest of the code uses. `review`
- **Q7.** A file has at most 300 lines, not counting blank lines and comments. `lint: max-lines`
- **Q8.** The repository root holds only files a tool requires there, plus `README.md`, `LICENSE`, `AGENTS.md` and `docs/` ([architecture §10](architecture.md#10-tooling-and-layout)). `review`

## Code shape

- **Q9.** Exported code comes first. Private helpers sit below their callers at module level, never at the top of a file, nor at the top of a factory or class body. `review`
- **Q10.** A service or repository opens its file with its contract: an exported interface carrying the doc comments. Its factory returns that interface, not `ReturnType<typeof …>`. `review`
- **Q11.** Parse, don't validate: turn raw input into a typed value once, at the boundary (`parseCalendarDate`, `parseNewEmployee`, `parsePage`), and pass that value on. Never check with an `isX` function and then keep using the raw input. `review`
- **Q12.** Build only what the task needs: no wrappers, pass-through files, steps, options or interfaces nobody uses. Call the helper directly. `review`
- **Q13.** Reuse existing hooks, helpers and test support. Code that appears twice becomes one shared piece. `review`
- **Q14.** A name says what the thing does (`detectCompanyNameAndLogo`, `eventBus`), not where it is used, in the words of [`thesaurus.md`](thesaurus.md). `review`
- **Q15.** Prefer zero-config solutions and modules: they work without setup, and every setting has a safe default. `review`

## Layers and place

- **Q16.** Dependencies point one way, `domain ← db ← app ← graphql | mcp | http`, each through the folder's `index.ts` ([architecture §1](architecture.md#1-shape-of-the-system)). `lint: boundaries`
- **Q17.** Each piece lives in the module and layer that owns it, not where it was first used: the logo upload belongs to the company feature, not the setup page. A type that names a domain fact lives in `domain`; `db` keeps only its tables and storage details. `utils` is the one folder for code that knows nothing about Broccoli; there is no other catch-all. `review`
- **Q18.** Related operations on one subject live in one service file, which keeps their formats and rules. Adapters (`graphql`, `mcp`, `http`) translate a request into one use-case call and keep only transport, such as cookies and redirects. `review`
- **Q19.** Every business function in `app` takes the caller's `SecurityContext` first, as `ctx`, and checks it. Work Broccoli does on its own runs as the system, never without a context. `review`
- **Q20.** A use case opens the transaction with `transact`; an operation meant to compose takes a required `tx`. Code never awaits work that needs another connection while holding locks, such as an HTTP call. `review`
- **Q21.** A module never reads another module's tables: it calls the other module's public functions or handles its events. `review`
- **Q22.** An integration reaches the network through `fetchJson` in `utils`, with no HTTP library, and nothing retries by default. `review`

## API

- **Q23.** The GraphQL schema is a connected graph: a parent lists its children as a connection, and a child returns its parent as an object, never as a bare id ([architecture §2](architecture.md#2-api)). `review`
- **Q24.** A mutation returns the object it changed, or its parent. `review`
- **Q25.** A field resolver that loads related objects batches through a per-request DataLoader (`perRequest`), never one query per parent. The exception is a paged connection on a parent (`ImportSource.employees`): one query per parent, so it belongs on types a client lists only a few of. `review`
- **Q26.** Inside a namespace, `create`, `update` and `delete` cover ordinary record changes; a domain action or a named part gets its own verb (`approve`, `removeLogo`). A name never repeats the namespace's object. `review`
- **Q27.** A use case reports an expected failure as an `ApplicationError` with one of its codes; field errors go in `extensions`. `review`
- **Q28.** A list is a Relay connection over a keyset query, built with `core/pagination` and `core/db`. `review`

## Data, configuration and logs

- **Q29.** A calendar `Date` is a `YYYY-MM-DD` string end to end and never becomes a JS `Date`. In the web app a `DateTime` stays a string too, and becomes a JS `Date` only inside display formatting; the API turns it into one at the scalar ([architecture §2](architecture.md#2-api), [§8](architecture.md#8-frontend)). `review`
- **Q30.** Configuration is environment variables parsed with Zod in the package's `env.ts`. A variable for one mode only carries that mode as its prefix (`MANAGED_…`, `SELF_HOSTED_…`). `review`
- **Q31.** Logs carry identifiers, never contents. A model request goes through `integrations/ai` and carries only what the question needs. `review`
- **Q32.** Nothing internal: no secrets, no `.env` files, no internal URLs. `review`

## Frontend

- **Q33.** A component that renders an entity in more than one place owns a colocated fragment named `<Component>_<field>` and reads it with `useFragment`; a component used by a single query reads that query's fields. `review`
- **Q34.** Every query selects `id`. `lint: @graphql-eslint/require-selections`
- **Q35.** GraphQL types come from codegen; none is written by hand. `review`
- **Q36.** Every user-facing string goes through `t()`. `review`
- **Q37.** Server data lives in the Apollo cache, navigation state in validated search params, and React state only for UI; component state stays minimal. `review`
- **Q38.** Route files stay thin; feature components live in `features/<module>/`. `review`
- **Q39.** App code uses Phosphor icons; Lucide appears only inside shadcn components. `review`

## Tests

How to write each kind of test is in [`testing.md`](testing.md).

- **Q40.** A change has only the tests `testing.md` asks for: domain unit tests, use-case integration tests, a few end-to-end tests for the wiring, and a test that reproduces each bug. `review`
- **Q41.** No tests of trivial code, private helpers or call order, of integrations on their own, of third-party APIs, or of configuration files, not even by running the tool on them: `pnpm check` runs it. `review`
- **Q42.** A test sits in the file of the code it checks. A concern shared by many modules, such as sessions or paging, gets its own test file. `review`
- **Q43.** A test covers one behaviour, is named after it, and has short setup with a visible arrange, act and assert. `review`
- **Q44.** Tests come first in a test file. Setup repeated across files becomes a helper in `#test/support`; the other helpers go to the bottom of the file. `review`
- **Q45.** Tests mock only external systems. They never mock Postgres or our own code; the one stand-in is `TestSecurityContext`. `review`
- **Q46.** Tests are deterministic: the clock and ID generators are injected, with no sleeps, no network and no dependence on test order. `review`

## Docs and comments

- **Q47.** A doc holds only what a reader needs: nothing obvious, generic, deferred or restated from the code. A change edits no doc outside its task. `review`
- **Q48.** A doc comment is one or two sentences: what it is and the non-obvious why. `review`
- **Q49.** `thesaurus.md` gets a term only when it is Broccoli's own, not a well-known one such as job, model or mapping. `review`
- **Q50.** A change that needs a new architecture decision changes `architecture.md` in the same pull request. `review`
