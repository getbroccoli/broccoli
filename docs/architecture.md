# Architecture

This document records the architecture decisions behind Broccoli. It is edited in place; the git history is its change log. Each section states the decision, the reasons and what is deliberately left open.

## 1. Shape of the system

- **Modular monolith.** One API process, one web single-page app, one container image. Modules live in `packages/api/src/modules/<name>/`.
- **Single-tenant.** One deployment and one Postgres database per company, for self-hosted and managed installs alike. There is no tenant column and no row-level security; the managed service runs one instance per company and migrates each.
- **Four layers per module.**
  - `domain`: pure TypeScript, no I/O.
  - `application`: use cases. The single place for authorisation, transactions, audit and events.
  - `adapters`: GraphQL, MCP and Postgres.
  - `index.ts`: the module's public surface.
- **Module manifest.** Each module exports one manifest: SDL and resolvers, MCP tools, event handlers, jobs. The core iterates over the list of manifests. No shared request context or central configuration has to be edited to add a module.
- **Cross-module calls** go through the other module's public use cases or its events. A module never reads another module's tables.
- **Domain-driven design is tiered** and decided per module when it is designed. The default is a plain domain layer with unit tests. Aggregates, value objects and domain events are used only where invariants demand them, such as leave balances, approvals and permissions.

## 2. API

- **GraphQL is the primary API and, for now, an internal contract** used by the Broccoli web app. It may change freely before 1.0. The schema is not published and there are no deprecation rules yet.
- **Schema-first SDL.** Each module owns its `.graphql` files; they are merged at startup. Resolver types come from `@graphql-codegen`; mapper configuration is module-local and composed at build time.
- **Namespaced mutations** group operations by module (`absence { request(...) }`). Because the GraphQL specification only guarantees serial execution for root mutation fields, the server rejects requests with more than one mutation field, and a lint rule enforces the same on client documents.
- **Server:** Express 5 and Apollo Server 5 via `@as-integrations/express5`. Depth limits, bounded pagination, introspection off in production, error masking configured explicitly.
- **File uploads** (spreadsheet import) use a bounded REST endpoint, not GraphQL. No subscriptions.

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
- **Transactions.** One application-level unit-of-work callback supplies repositories bound to the same transaction. ORM types stay inside the Postgres adapters. Code never awaits work that needs another connection while holding locks.
- `pgvector` is added only when a feature needs it.

Kysely with generated types and Prisma were considered. Drizzle was chosen for a single source of truth and generated migrations; the cost is that generated SQL must be reviewed.

## 5. Events, jobs and workflows

- **Postgres only, one engine.** A transactional outbox table is written in the same transaction as the mutation and its audit row. **pg-boss** drains the outbox and runs all background jobs and cron.
- Delivery is ordered per entity; consumers are idempotent. No timers, no second workflow engine, no external queue.
- Workflows such as approvals and onboarding are state machines in the domain; each step is a job.

## 6. Auth and sessions

- **Better Auth** with the Drizzle adapter, mounted before body parsers. Only the plugins in use are enabled; packages are pinned together.
- **Sessions** are opaque, database-backed and carried in Secure, HttpOnly cookies, with CSRF protection and cookie caching off. Logout, account disabling and permission changes take effect immediately.
- **MCP clients** authenticate with OAuth 2.1 through `@better-auth/oauth-provider` and `@better-auth/mcp` (discovery, PKCE S256, client registration, audiences, refresh, revocation). An application-level active-grant check makes revocation immediate.
- **Managed sign-in.** A small plugin endpoint validates a signed single-use ticket from the managed sign-in service (issuer and audience checks, atomic one-time use, subject-based account linking) and creates a normal session.
- **Owned by Broccoli, not the library:** owner bootstrap and recovery, invitations (email, later Slack), act-as impersonation (real actor and effective profile stored server-side, both audited, no credential or grant changes while impersonating), password policy.

## 7. Permissions and audit

- **Permissions** combine row scopes (`self`, `team`, `reporting_line`, `all`) per object with field visibility (`public`, `protected`, `sensitive`). Both are enforced in the application layer: use cases receive an actor and grants, repositories apply scope predicates before pagination and counting, and results are projected to readable fields before leaving the use case. Filtering and sorting cannot reveal hidden fields.
- **Audit.** Every mutation emits a domain event carrying the real actor (including impersonation), the client (web, MCP or job) and a trace id. Events land in an append-only `audit_log`; a trigger rejects updates and deletes. There is no generic field history in the first release.
- **Custom fields** are deferred to their own module design. The only decision now: no runtime DDL.

## 8. Frontend

- **Vite single-page app** with React 19, served as static files by the API container with a deep-link fallback. No server-side rendering.
- **TanStack Router** with file-based routes and automatic code splitting; `routeTree.gen.ts` is committed. A pathless `_authenticated` layout with a `beforeLoad` redirect is the auth gate. Filters, sorting, pagination and wizard state live in validated search params.
- **Apollo Client 4** with the default normalised cache. Every object type exposes `id` and every query selects it (lint rule). Type policies for mutation namespaces and `possibleTypes` are generated at codegen time. Creates and deletes refetch the affected list queries. The cache is cleared on logout and act-as. Prefetching from router loaders is decided in the frontend module design.
- **UI kit:** shadcn/ui in the `base-nova` style on Base UI (triggers take `render`, not `asChild`), Tailwind v4 with design tokens as CSS variables in `styles.css`, Phosphor icons in app code (Lucide only inside shadcn components). The Hanken Grotesk font is bundled, so the browser makes no third-party requests. Light theme only for now.
- **Shell:** a window-sized frame with the navigation on the left and the Canvas, a card that owns its own scroll; the document never scrolls.
- **TanStack Form** with Zod schemas, shared with API input validation where practical, and shadcn/ui components.
- **State:** Apollo cache for server data, the URL for navigation state, React state and context for UI only.
- **i18n:** English only, but every user-facing string goes through one `t()` helper from day one.
- Route files stay thin; feature components live in `features/<module>/`; a lint rule caps files at 300 lines.
- No frontend tests for now.

## 9. Testing

- **Vitest** everywhere. Domain unit tests sit next to the code. End-to-end API tests under `packages/api/test/e2e` start the real server and call it over HTTP (GraphQL once it exists) against a real Postgres.
- **Isolation.** One template database is migrated once per run; each test file gets a fresh database cloned from it, so files run in parallel. Database names carry a per-run id, so several runs can share one Postgres server.
- **Test data** comes from typed factories per module that go through the public use cases, not raw inserts, plus one small seed for the demo company.
- **Property-based tests** are used sparingly and agreed case by case (access rules are the first candidate).
- MCP gets smoke tests after the first release.

## 10. Tooling and layout

- **pnpm** workspaces and **Turborepo**, remote cache off.
- Packages live under `packages/`: `api`, `web`, `updater`, `scripts` and shared packages, which are added when there is code to share.
- The repository root stays short: only files a tool requires there, such as the workspace files, the Compose file and `.env.example`, plus `README.md`, `LICENSE`, `AGENTS.md` and `docs/`.
- **Builds.** The web app builds with Vite and the API with tsdown, so TypeScript resolves imports like a bundler: relative imports carry no file extension and a folder is imported by its name, which resolves to its `index.ts`.
- **ESLint** (typescript-eslint, module boundaries, `@graphql-eslint`, project rules for SDL) and **Prettier**.
- **Scripts** are kept to a minimum: `packages/scripts/start.sh`, `packages/scripts/dev.sh` and `packages/scripts/prune.mjs`. Everything else is a pnpm script or a Compose file. New scripts are added only for a demonstrated need.
- **CI** on GitHub Actions: format, lint and type check; unit tests; end-to-end tests against a Postgres service; Docker image build; secret scanning. Jobs that need Docker services run on self-hosted runners inside a container and reach services by hostname, never through host ports.

## 11. Development environment

- `docker-compose.yml` is the self-hosting file: Postgres, the Broccoli image (built from `packages/api/Dockerfile`) and, later, the updater. `docker compose up` needs no `.env` and serves Broccoli on port 8080. `docker-compose.dev.yml` overrides it for development: `api` runs `tsx watch`, `web` runs the Vite dev server, the checkout is bind-mounted and `node_modules` lives in a named volume per project.
- Compose names the project after the folder, so each checkout or worktree gets its own containers, volumes and network. Host ports come from the gitignored `.env` (`HOST_WEB_PORT`, `HOST_PG_PORT`) with defaults in `.env.example`. `pnpm start` runs `start.sh`, which starts the stack on a free host port unless `HOST_WEB_PORT` is set and prints the URL, so worktrees run side by side.
- `pnpm dev` runs `dev.sh`, which traps exit and runs `docker compose down`, so Ctrl-C, errors and normal exits all tear the stack down.
- `pnpm dev:prune` removes Compose projects whose checkout no longer exists.
- End-to-end tests use the same Compose file with a `test` profile for a throwaway Postgres. Its host port is picked freely unless `HOST_PG_PORT` is set, and the tests find it with `docker compose port`.

## 12. Configuration, secrets, observability and self-hosting

- **Configuration** is environment variables validated with Zod at startup (blank counts as unset), one `env.ts` per package, no configuration files. Feature flags are plain environment variables.
- **Secrets.** On first boot the app generates the encryption key and cookie secret into a volume file (`/data/secrets/`, mode 600) and reads them on later boots; `ENCRYPTION_KEY` in the environment overrides the file. Third-party credentials (Slack and similar) are stored encrypted in the database. The rule: the database holds hashes and ciphertext, never keys. Operators back up the secrets volume together with the database.
- **Logging** with pino: identifiers, not contents; a redaction list; a trace id on every line.
- **Observability** with OpenTelemetry auto-instrumentation, OTLP export off by default. `/healthz` and `/readyz` (ready only after migrations). No third-party error service.
- **Self-hosting.** One image containing the API, the static web app and migrations; the API serves the web app from `WEB_DIR` and answers other page paths with `index.html`. Postgres from Compose, with trust auth on the Compose network and no published port; publishing it requires a password first. An updater sidecar that pulls a tag, pins the image by digest, health-checks and rolls back. Backup is documented `pg_dump`, not a built-in feature.
- **Managed** installs use the same image with per-instance environment and the sign-in plugin from §6.
