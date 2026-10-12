# Architecture

This document records the architecture decisions behind Broccoli. It is edited in place; the git history is its change log. Each section states the decision, the reasons and what is deliberately left open.

## Layout of the API

```
packages/api/src/
├── core/          what every module shares: server, database, GraphQL, auth, events
├── modules/       business modules, one folder each, such as company and employees
├── integrations/  clients of external services; return plain data, know no module
└── utils/         helpers that know nothing about Broccoli, such as getJson
```

**Import rules.** Each package's `importRules.json` ([API](../packages/api/importRules.json), [web](../packages/web/importRules.json)) lists what each folder, or single file, may import; anything not listed is forbidden. ESLint enforces it, allows a folder to be imported only through its `index.ts`, and refuses rules whose graph has a cycle. A module imports another module only where that pair is listed, and then only its public use cases or events, never its tables or repositories. `core` never imports a module.

## 1. Shape of the system

- **Modular monolith.** One API process, one web single-page app, one container image. The folders of the API are listed above. An integration handles transport (URL, timeout, response format); the rules about the data it returns stay in the module. Integrations use Node's built-in `fetch` through `getJson` in `utils` (timeout, size cap, schema), with no HTTP library; a vendor SDK is added only where it removes real work, and nothing retries by default.
- **Single-tenant.** One deployment and one Postgres database per company, for self-hosted and managed installs alike. There is no tenant column and no row-level security; the managed service runs one instance per company and migrates each.
- **Layers per module.**
  - `domain`: pure TypeScript, no I/O.
  - `db`: the Postgres adapter. Concrete repositories over the ORM or a transaction (`employeeRepository(db)`) that take and return domain types.
  - `app`: the application layer. `app/useCases/` holds one function per thing a user can do, and its `index.ts` is the module's use-case factory (`createEmployeeUseCases({ orm })`). Use cases are the single place for authorisation, transactions, audit and events.
  - `graphql`, `mcp` and `http`: adapters that translate a request into one use-case call; no rules. `http` holds the few routes GraphQL cannot serve, such as images.
  - `index.ts`: the module's public surface; it composes the adapters with the use cases.
  - A `core/` folder that owns state and rules, such as `core/instance` (owner and setup), uses the same layers; its adapter folder is named after its technology (`betterAuth`).
  - **Dependencies point one way:** `domain ← db ← app ← graphql | mcp | http`, each through the folder's `index.ts`, as the `layers` of `importRules.json` declare. Repositories and use cases are concrete, and their types are inferred; there are no hand-written interfaces, because tests never replace our own code (see `docs/testing.md`).
- **Module manifest.** Each module exports one factory, such as `employeesModule({ orm })`, that receives the core's dependencies at startup, builds its use cases once and returns its manifest: SDL and resolvers, event handlers, HTTP routes under `/api/`, later MCP tools and jobs. A factory takes only the core services it uses (`Pick<ModuleDependencies, "orm" | "eventBus">`) plus its own settings; `createModules` in `modules/index.ts` is the one place that hands them out, so a new dependency touches only the modules that use it. The core iterates over the list of manifests. The GraphQL context carries the actor (`UserActor`: the use-case `Actor` plus the sign-in email for display); resolvers call the module's use cases with it. No shared request context or central configuration has to be edited to add a module.
- **Cross-module calls** go through the other module's public use cases or its events. A module never reads another module's tables.
- **Domain-driven design is tiered** and decided per module when it is designed. The default is a plain domain layer with unit tests. Aggregates, value objects and domain events are used only where invariants demand them, such as leave balances, approvals and permissions.

## 2. API

- **GraphQL is the primary API and, for now, an internal contract** used by the Broccoli web app. It may change freely before 1.0. The schema is not published and there are no deprecation rules yet.
- **Schema-first SDL.** Each module owns its `.graphql` files and declares its own `type Query` and `type Mutation` fields; they are merged at startup with the core's shared SDL (`Date`, `DateTime`, `PageInfo`). Resolver types come from `@graphql-codegen`; mapper configuration is module-local and composed at build time. Generated files (`*.gen.ts`) are not committed: `pnpm codegen` writes them, it runs after `pnpm install`, and every Turborepo task that needs them depends on it.
- **Namespaced mutations** group operations by module (`absence { request(...) }`). Because the GraphQL specification only guarantees serial execution for root mutation fields, and the fields inside a namespace run in parallel, the server lets a mutation select one namespace and one operation in it; client documents are not linted for it.
- **Errors.** Errors raised before execution (parse, validation, bad input) reach the client as they are. Use cases report expected failures with an `ApplicationError`: `UNAUTHENTICATED`, `FORBIDDEN` or `INVALID_INPUT` with field errors (`{ field: "email", code: "taken" }`) in `extensions`. Any other error is masked.
- **Pagination.** Lists are Relay connections (`first`, `after`; `edges { cursor node }`, `pageInfo { hasNextPage endCursor }`) over keyset queries. Cursors are opaque base64url strings of the sort key and the id, prefixed with the order they belong to, so a cursor from another order is refused. `first` defaults to 100 and is at most 10,000. `core/pagination` parses page arguments and builds connections; `core/db` builds the keyset condition. Lists take `orderBy: { field, direction }` and a `filter` input; `keysetOrder` always ends the order with the id, and `nullsLast` puts empty values last in both directions. Trade-off: a cursor holds the sort values of the last row seen, so inserts and deletes never shift other rows, but a row whose sort value changes while someone pages can appear twice or be skipped in that pass.
- **Scalars.** `Date` is a calendar day, `YYYY-MM-DD`, and stays a string end to end. `DateTime` is an instant: ISO 8601 with a time zone in, UTC ISO out, and a JS `Date` inside the API.
- **Server:** Express 5 and Apollo Server 5 via `@as-integrations/express5`, at `/api/graphql`. Every API route lives under `/api/`; only the health probes `/healthz` and `/readyz` sit at the root, and an unknown `/api/` path is a 404, never the web app. Depth limits, bounded pagination, introspection off in production, error masking configured explicitly.
- **Mutation names.** Inside a namespace, `create`, `update` and `delete` cover ordinary record changes (`employee { create }`, `company { update(input:) }`); a domain action or a named part gets its own verb (`approve`, `removeLogo`). A name never repeats the namespace's object.
- **File uploads** (spreadsheet import, the company logo) use a bounded REST endpoint, not GraphQL: the logo is `PUT /api/company/logo` with the raw image as the body. No subscriptions.

## 3. MCP

Broccoli exposes a [Model Context Protocol](https://modelcontextprotocol.io) server so the operator's own agent can read and act on company data.

- **Tools are hand-written over shared use cases.** GraphQL resolvers and MCP tools are two thin adapters over the same application layer. Permissions, field visibility and audit are enforced in use cases, so an MCP tool can never do more than the GraphQL API allows.
- **Small catalogue.** The first release has about ten tools: search, read and update people, field definitions, reporting lines, and the import steps `start_import`, `upload`, `set_mapping`, `preview_import`, `commit_import`. Import drafts live in Postgres; parsing is deterministic and the agent proposes column mappings. No model key is needed on the Broccoli side.
- **Consequential writes need browser approval.** Committing an import requires the user to approve an exact draft revision in the web app. A tool argument such as `confirmed: true` proves nothing. Edits invalidate the approval; commit is idempotent and re-checks permissions.
- **Transport and auth.** Stateless Streamable HTTP via `@modelcontextprotocol/express`. OAuth 2.1 with PKCE (see §6) with read-only or read/write grants, intersected with the user's permissions. MCP resources and prompts are deferred.

## 4. Data access

- **Drizzle ORM**, pinned to the 0.45 line. The TypeScript schema is the single source of truth; `drizzle-kit generate` produces SQL migrations that are reviewed in each pull request. Hand-written SQL in migrations is allowed for extensions, triggers and constraints.
- Recursive CTEs (org chart, reporting lines), window functions and JSONB paths use the `sql` tag.
- Upgrading to Drizzle 1.0 (new migration folder format, Relational Queries v2) is a planned task after the first release.
- **One Postgres role** and one `DATABASE_URL`. The role owns the schema, so Broccoli runs on managed Postgres plans that offer no superuser. Migrations run at startup under a Postgres advisory lock, so instances starting together apply them one after another. The instance does not report ready until they succeed.
- **Transactions.** A use case opens one with `runInTransaction(orm, eventBus, work)` and passes the opaque `Tx` it gets to every operation that must join it, its own repositories (`companyRepository(tx)`) and other modules' public operations (`advanceStep(tx, …)`) alike. Operations meant to compose take a required `tx`; there is no nesting and no savepoint, and a `Tx` used after its transaction ended throws. Only database adapters reach the ORM behind a `Tx` (`ormOf`), so ORM types stay inside them. Code never awaits work that needs another connection while holding locks, such as an HTTP call.
- `pgvector` is added only when a feature needs it.

Kysely with generated types and Prisma were considered. Drizzle was chosen for a single source of truth and generated migrations; the cost is that generated SQL must be reviewed.

## 5. Events, jobs and workflows

- **Postgres only, one engine.** A transactional outbox table is written in the same transaction as the mutation and its audit row. **pg-boss** drains the outbox and runs all background jobs and cron.
- Delivery is ordered per entity; consumers are idempotent. No timers, no second workflow engine, no external queue.
- **Until the outbox lands**, domain events are delivered in process. A publisher queues a domain event on its transaction (`tx.publish(type, payload)`); `runInTransaction` dispatches the queue after the commit and drops it on rollback. Handlers run one after another and are awaited, so the request answers after them; a failing handler is logged, never passed to the publisher. Event types are declared by their publisher by declaration merging on `DomainEvents`, and modules subscribe through their manifest's `events`. A crash between commit and dispatch loses the event, which is accepted for now; the outbox will write the queue in the transaction instead, without changing publishers or handlers.
- Workflows such as approvals and onboarding are state machines in the domain; each step is a job.

## 6. Auth and sessions

- **Better Auth** with the Drizzle adapter, mounted before body parsers. Only the plugins in use are enabled; packages are pinned together.
- **Sessions** are opaque, database-backed and carried in Secure, HttpOnly cookies, with CSRF protection and cookie caching off. Logout, account disabling and permission changes take effect immediately. A session lasts 7 days and is renewed daily while in use; GraphQL, which every page calls, passes the renewed cookie on to the browser; other HTTP routes do not renew. The web app reads the signed-in user from `Query.me`.
- **MCP clients** authenticate with OAuth 2.1 through `@better-auth/oauth-provider` and `@better-auth/mcp` (discovery, PKCE S256, client registration, audiences, refresh, revocation). An application-level active-grant check makes revocation immediate.
- **Mode.** `BROCCOLI_MODE` is `self_hosted` (the default) or `managed`. It is deployment configuration, so it lives in the environment, not the database.
- **Managed init.** A managed instance boots with `MANAGED_INSTANCE_ID` (its pool slot) and `MANAGED_ACCOUNTS_URL` (default `https://accounts.getbroccoli.com`) and waits. Orchestration assigns it with `POST /api/init`: an EdDSA token from that issuer, audience `instance:<MANAGED_INSTANCE_ID>`, purpose `init`, living at most a minute, carrying `{ companyId, publicOrigin, websiteOrigin }`. The assignment is stored on the `instance` row once; the same request again is accepted, a different one refused. Until then `/readyz` reports `initStatus: waiting` and user routes answer 503. Better Auth is built from the stored assignment on first use, so an assigned pool instance needs no restart.
- **Managed sign-in.** A Better Auth plugin: `GET /api/auth/managed/start` sets a state cookie and sends the browser to the website's entry page with the company id; the website posts a ticket from the accounts service to `POST /api/auth/managed/callback`. The ticket is checked (EdDSA, issuer, audience = the public origin, at most a minute, the website's exact Origin, state = cookie), its `jti` is used once in the transaction that finds the owner by subject, never by email, or claims the owner on a new instance, and a normal session is created. Failures redirect to `/login?error=…`.
- **Owner bootstrap.** Self-hosted installs have no public sign-up: the first visitor of a new install creates the owner. `POST /api/auth/setup`, a Broccoli plugin on Better Auth, creates the owner's user, password and session in one transaction that locks the `instance` row, and refuses once an owner exists. The owner is identified by the user id, not the email. Managed installs have no setup endpoint; the first valid sign-in ticket claims the owner through the same owner claim.
- **Passwords** are 8 to 128 characters.
- **Owned by Broccoli, not the library:** owner bootstrap and recovery, invitations (email, later Slack), act-as impersonation (real actor and effective profile stored server-side, both audited, no credential or grant changes while impersonating), password policy.

## 7. Permissions and audit

- **Permissions** combine row scopes (`self`, `team`, `reporting_line`, `all`) per object with field visibility (`public`, `protected`, `sensitive`). Both are enforced in the application layer: use cases receive an actor and grants, repositories apply scope predicates before pagination and counting, and results are projected to readable fields before leaving the use case. Filtering and sorting cannot reveal hidden fields. Signing in is the adapters' concern, so a use case always receives an `Actor` and decides only what that actor may do. GraphQL denies by default: every root field without the `@public` directive refuses a request without a session before its resolver runs, and resolvers read `context.actor` without checking; only `@public` fields (`ping`, `setup`, `me`) read the nullable `context.optionalActor`. HTTP routes and MCP tools call `requireSignedIn(actor)`. Until scopes are built, use cases call `requireOwner(actor)`: the owner has scope `all`, everyone else nothing.
- **Audit.** Every mutation emits a domain event carrying the real actor (including impersonation), the client (web, MCP or job) and a trace id. Events land in an append-only `audit_log`; a trigger rejects updates and deletes. There is no generic field history in the first release.
- **Custom fields** are deferred to their own module design. The only decision now: no runtime DDL.

## 8. Frontend

- **Vite single-page app** with React 19, served as static files by the API container with a deep-link fallback. No server-side rendering.
- **TanStack Router** with file-based routes and automatic code splitting; `routeTree.gen.ts` is generated by `pnpm codegen` and not committed. A pathless `_authenticated` layout with a `beforeLoad` redirect to `/login?redirect=…` is the auth gate and renders the shell. While no owner exists, the root route sends every path to `/setup`; while the company step is open, the gate sends signed-in pages to `/setup/company`. Setup pages use `SetupLayout`; other pages outside the shell use `AuthCard`. An Apollo error link sends any `UNAUTHENTICATED` response through the gate. Filters, sorting, pagination and wizard state live in validated search params.
- **Apollo Client 4** with the default normalised cache and data masking. Operations are `.graphql` files next to the feature that uses them. `@graphql-codegen`'s client preset reads the API's SDL files (introspection is off) and writes typed documents to the gitignored `src/__generated__/`, imported by file path. Every object type exposes `id` and every query selects it (`@graphql-eslint`'s `require-selections`). `possibleTypes` and `{ merge: true }` type policies for namespace types, the `id`-less types that root fields return, are generated at codegen time. A component that renders an entity in more than one place owns a colocated fragment named `<Component>_<field>` (`EmployeeNameCell_employee`) and reads it with `useFragment`; queries spread it, and data masking keeps its fields private to it. A component used by a single query reads that query's fields. Creates and deletes refetch the affected list queries. The cache is cleared (`clearStore`) on sign-in, sign-out and act-as. Components query with `useQuery`; router loaders do not prefetch. The one exception is the `Session` query (`me` and `setup`), which the root route's `beforeLoad` runs on every navigation and passes on as route context for the gates.
- **UI kit:** shadcn/ui in the `base-nova` style on Base UI (triggers take `render`, not `asChild`), Tailwind v4 with design tokens as CSS variables in `styles.css`, Phosphor icons in app code (Lucide only inside shadcn components). The Hanken Grotesk font is bundled, so the browser makes no third-party requests. Light theme only for now.
- **Lists:** content lists use the shared `DataTable` in `components/dataTable/`, fed a column set by the feature, and `useListPage` in `lib/listPage/` for search, sort and cursor paging in the URL. The feature keeps its search schema, query and copy.
- **Shell:** a window-sized frame with the navigation on the left and the Canvas, a card that owns its own scroll; the document never scrolls.
- **TanStack Form** with Zod schemas, shared with API input validation where practical, and shadcn/ui components.
- **State:** Apollo cache for server data, the URL for navigation state, React state and context for UI only.
- **i18n:** English only, but every user-facing string goes through one `t()` helper from day one.
- **Dates are strings.** `Date` and `DateTime` values arrive and leave as strings (codegen maps both to `string`) and are stored, compared and sent as strings. A calendar `Date` is never turned into a JS `Date`: `new Date("2026-10-10")` is UTC midnight and shows the previous day west of UTC. A `DateTime` becomes a JS `Date` only inside display formatting (`Intl.DateTimeFormat`). A calendar `Date` is displayed by formatting the timestamp `Date.UTC(y, m - 1, d)` with `timeZone: "UTC"`.
- Route files stay thin; feature components live in `features/<module>/`; a lint rule caps files at 300 lines. Routes and the shell compose features; a feature imports another feature only where `importRules.json` lists it.
- Pure frontend functions get unit tests; no component or browser tests yet.

## 9. Testing

- **Vitest** everywhere, in three layers. Domain unit tests sit next to the code. Use-case integration tests (`*.int.test.ts`) sit next to the use cases and call them directly against a real Postgres; they carry most of the behaviour. End-to-end API tests under `packages/api/test/e2e` start the real server and call it over HTTP to prove the wiring.
- **Isolation.** One template database is migrated once per run; each test file gets a fresh database cloned from it, so files run in parallel. Database names carry a per-run id, so several runs can share one Postgres server.
- **Test data** comes from `TestSeed`, which inserts through each module's repository and skips the use cases, so setup never depends on the code under test and writes no audit rows or events; plus one small seed for the demo company.
- **Property-based tests** are used sparingly and agreed case by case (access rules are the first candidate).
- MCP gets smoke tests after the first release.

## 10. Tooling and layout

- **pnpm** workspaces and **Turborepo**, remote cache off.
- Packages live under `packages/`: `api`, `web`, `updater`, `scripts` and shared packages, which are added when there is code to share.
- The repository root stays short: only files a tool requires there, such as the workspace files, the Compose file and `.env.example`, plus `README.md`, `LICENSE`, `AGENTS.md` and `docs/`.
- **Builds.** The web app builds with Vite and the API with tsdown, so TypeScript resolves imports like a bundler: relative imports carry no file extension and a folder is imported by its name, which resolves to its `index.ts`.
- **ESLint** (typescript-eslint, import rules from `importRules.json` through `eslint-plugin-boundaries`, `@graphql-eslint`, project rules for SDL) and **Prettier**.
- **Scripts** are kept to a minimum: `packages/scripts/dev.sh` and `packages/scripts/prune.mjs`. Everything else is a pnpm script or a Compose file. New scripts are added only for a demonstrated need.
- **CI** on GitHub Actions: format, lint and type check; unit tests; end-to-end tests against a Postgres service; secret scanning. Jobs that need Docker services run on self-hosted runners inside a container and reach services by hostname, never through host ports.

## 11. Development environment

- `docker-compose.yml` is the self-hosting file: Postgres, the Broccoli image (built from `packages/api/Dockerfile`) and, later, the updater. `docker compose up` needs no `.env` and serves Broccoli on port 8080. `packages/scripts/docker-compose.dev.yml` overrides it for development: `api` runs `tsx watch`, `web` runs the Vite dev server and proxies API paths to `api`, the checkout is bind-mounted with the `node_modules` that `dev.sh` installs on the host, containers run as the host user and development data has its own Postgres volume. pnpm is needed only for development; self-hosters run `docker compose up`.
- Compose names the project after the folder, so each checkout or worktree gets its own containers, volumes and network. Host ports come from the gitignored `.env` (`HOST_WEB_PORT`, `HOST_PG_PORT`) with defaults in `.env.example`. `HOST_WEB_PORT=0` picks a free port, so the production image runs from any worktree with `HOST_WEB_PORT=0 docker compose up --build`.
- `pnpm dev` runs `dev.sh`, which starts the development stack on a free host port unless `HOST_WEB_PORT` is set, prints the URL and follows the logs. It traps exit and runs `docker compose down`, so Ctrl-C, errors and normal exits all tear the stack down; volumes are kept.
- `pnpm dev:prune` removes Compose projects whose checkout no longer exists. The development Postgres volume is labelled with its checkout folder; unlabelled projects are never touched.
- End-to-end tests use the same Compose file with a `test` profile for a throwaway Postgres. Its host port is picked freely unless `HOST_PG_PORT` is set, and the tests find it with `docker compose port`.

## 12. Configuration, secrets, observability and self-hosting

- **Configuration** is environment variables validated with Zod at startup (blank counts as unset), one `env.ts` per package, no configuration files. Feature flags are plain environment variables. A variable that applies to one mode only carries that mode as its prefix (`MANAGED_…`, `SELF_HOSTED_…`), and startup refuses the other mode's variables, so no fact has two sources.
- **Data folder.** `DATA_DIR` (default `/data`, a Compose volume) holds files that must survive restarts. `SELF_HOSTED_PUBLIC_URL` is the address browsers use; unset, Broccoli trusts the address of each request. Session cookies are Secure when `SELF_HOSTED_PUBLIC_URL` is https; without it the protocol is unknown, so they are not.
- **Secrets.** On first boot the app generates the encryption key and cookie secret into a volume file (`/data/secrets/`, mode 600) and reads them on later boots; `ENCRYPTION_KEY` in the environment overrides the file. Third-party credentials (Slack and similar) are stored encrypted in the database. The rule: the database holds hashes and ciphertext, never keys. Operators back up the secrets volume together with the database.
- **Brand lookup.** `BRAND_LOOKUP_URL` is unset by default, so a self-hosted instance makes no third-party call and suggests the company name from the owner's email domain only. Managed instances set it to a service that is not public; when set, Broccoli sends the owner's email domain, never the address, once, and stores the name and logo it gets back.
- **Logging** with pino: identifiers, not contents; a redaction list; a trace id on every line.
- **Observability** with OpenTelemetry auto-instrumentation, OTLP export off by default. `/healthz` and `/readyz` (ready only after migrations). No third-party error service.
- **Self-hosting.** One image containing the API, the static web app and migrations, published to `ghcr.io/getbroccoli/broccoli` for every commit on `main` and on pull request branches, tagged with the short commit SHA; the API serves the web app from `WEB_DIR` and answers other page paths with `index.html`. Postgres from Compose, with trust auth on the Compose network and no published port; publishing it requires a password first. An updater sidecar that pulls a tag, pins the image by digest, health-checks and rolls back. Backup is documented `pg_dump`, not a built-in feature.
- **Managed** installs use the same image with `BROCCOLI_MODE=managed` and `MANAGED_INSTANCE_ID`; their company, address and website come from the signed init (§6), not the environment.
