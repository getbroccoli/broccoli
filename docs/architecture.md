# Architecture

This document records Broccoli's architecture decisions and their reasons. It is edited in place; the git history is its change log. Its scope follows [RULE61](code-quality.md#docs-and-comments).

## Layout of the API

```
packages/api/src/
├── core/          shared infrastructure and instance-wide concerns
├── modules/       business modules, one folder per domain
├── integrations/  clients of external services; know no business module
└── utils/         helpers that know nothing about Broccoli
```

Each package declares its allowed dependencies, enforced by lint with no cycles ([RULE2, RULE3](code-quality.md#modules-and-files)). Core never imports a business module; startup composes them through their public surfaces.

## 1. Shape of the system

- **Modular monolith.** One API process, one web single-page app, one container image. Business modules own their rules; integrations own external transport. This keeps deployment simple without giving up module boundaries.
- **Single-tenant.** One deployment and one Postgres database per company, for self-hosted and managed instances alike. There is no tenant column or row-level security; the managed service runs and migrates each instance separately.
- **Layers per module** separate business decisions, persistence, application coordination and transport, as described below. State-owning parts of core follow the same structure.
- **Composition.** Startup supplies each module with only the dependencies it needs and collects its API, routes, event handlers and jobs. Modules communicate through public operations or events, never through another module's tables ([RULE21](code-quality.md#layers-and-place)).
- **Domain-driven design is tiered.** A plain domain layer with unit tests is the default. Aggregates, value objects and domain events are introduced where invariants demand them, with each business decision owned in one place ([RULE52](code-quality.md#layers-and-place)).
- **Demo data.** The demo module owns the sample company and coordinates other modules' public operations in one transaction; it owns no tables. Exiting the demo removes the sample company and people added during it, then returns to setup. A regular owner keeps their account; a provisional owner follows the separate lifecycle in §6.
- **Four primitives.** HR features share records, tasks, calendar and processes, so each feature does not grow its own task queue, history and approval engine. A record stays a typed entity in its owning module; shared capabilities do not turn records into a generic storage engine. Tasks, calendar, processes and shared record capabilities are not built yet. Domain-specific rules, such as leave balances, stay with the feature that owns them.

### Module layers

Layers live inside the module that owns the feature. For example, a company logo upload belongs to the company module even when setup first uses it. Shared technical folders hold concerns with no feature owner. This organization keeps business decisions usable from every transport and testable without a database, while persistence and transport can change independently ([RULE56, RULE17](code-quality.md#layers-and-place)).

- **`domain` — business decisions.** Holds business facts, invariants, calculations and valid state transitions. It works on domain values without I/O or knowledge of storage, requests or frameworks. A business decision has one owner here, so every caller applies the same rule.
- **`db` — persistence.** Owns tables, queries, persistence constraints, locking and mapping between stored data and domain objects. Repositories hide SQL and ORM details and return whole domain items, with encrypted secrets read separately, so callers do not assemble business state from storage fragments.
- **`app` — application coordination.** Use cases and services coordinate authorization, domain decisions, repositories, integrations, transactions and events or jobs. This layer owns the operation's workflow and transaction boundary. It gathers the facts a domain decision needs and applies its result without duplicating that decision.
- **`graphql`, `http`, `mcp` — transport adapters.** Handle request parsing, caller identity, transport-specific responses and error translation. They delegate operations to the application layer, so permissions and business behavior remain the same for the web app and agents.
- **`helpers` — module-local technical work.** Holds concerns such as parsing an origin or hashing a secret. Every layer may use these helpers, which cannot depend back on those layers. This keeps technical concerns out of the domain model; helpers with no Broccoli knowledge belong in `utils`.

Dependencies point inward: adapters → `app` → `db` → `domain`; `app` also uses `domain` directly. Layers expose their public contracts through their folder's entry point. The allowed imports are enforced, rather than relying on convention ([RULE16, RULE17, RULE58](code-quality.md#layers-and-place)).

**Use cases and services.** A use case represents an action a caller can perform. Related operations on one subject form a service, keeping that subject's lifecycle and formats together; an independent action remains its own use case. Adapters translate each operation into one use-case call and retain only transport concerns such as cookies and redirects ([RULE18](code-quality.md#layers-and-place)).

**Applying the boundaries.** Authorization belongs to the use case even when an adapter already authenticated the caller. The use case owns the transaction; composed operations share it, and database adapters supply the locks and constraints that keep concurrent writes safe. External calls stay outside database locks. These choices keep an operation consistent across transports and under concurrency ([RULE19, RULE20](code-quality.md#layers-and-place)).

For example, a domain rule decides whether an import source may retry. The application layer checks the caller and coordinates the retry; the repository persists the change under the required concurrency checks, and the adapter presents the result. The decision is not repeated in a resolver or SQL query ([RULE52, RULE60](code-quality.md#layers-and-place)).

## 2. API

- **GraphQL is the primary API**, currently an internal contract for the web app. It may change before 1.0; there is no published schema or deprecation policy yet.
- **Schema-first.** Modules own their SDL and resolvers, composed into one schema. Generated types connect the API and web app to that contract.
- **Connected graph.** Related types link in both directions so components can select their data through fragments without adding root queries ([RULE23](code-quality.md#api)). Related-object reads use request-scoped batching to avoid N+1 queries ([RULE25](code-quality.md#api)).
- **Mutation payloads** carry the changed object, or its parent after removal, and typed expected failures. This lets clients select the result in the same request and lets contracts grow without changing unrelated operations ([RULE24, RULE27](code-quality.md#api)). Authentication, authorization, query and pre-execution failures remain top-level GraphQL errors; unexpected errors are masked.
- **Namespaced mutations** group operations by module. GraphQL guarantees serial execution only for root mutation fields; nested fields may run in parallel. The server therefore permits one namespace and one operation per mutation. Naming follows [RULE26](code-quality.md#api).
- **Pagination.** Lists use Relay connections over keyset queries with a stable order and a unique tie-breaker. Cursors are opaque and bound to their sort order. Inserts and deletes do not shift other rows, but a row whose sort value changes during paging can appear twice or be skipped in that pass.
- **Dates.** A calendar date stays a `YYYY-MM-DD` string end to end. A date-time represents an instant, accepts an explicit time zone and returns UTC ([RULE29](code-quality.md#data-configuration-and-logs)).
- **Transport.** Express and Apollo serve the API on the web app's origin. API routes are separate from health probes and the web fallback. Query depth and page sizes are bounded; production introspection is disabled. There are no subscriptions.
- **Files** use bounded HTTP uploads. Untrusted workbook parsing runs in a worker with memory and time limits, so a hostile file cannot occupy the API's main thread.

## 3. MCP

[Model Context Protocol](https://modelcontextprotocol.io) is the planned API for an owner's agent to read and act on company data.

- **Shared application layer.** MCP tools are thin adapters over the same use cases as GraphQL, with the same permissions, field visibility and audit. A small, purpose-built tool catalogue avoids exposing the entire schema as tools.
- **Browser approval.** Consequential writes require approval of an exact draft revision in the web app. Edits invalidate approval, and committing re-checks permissions and is idempotent. An agent's claim that a user confirmed is not approval.
- **Existing setup access.** External agents already answer import mapping questions through dedicated HTTP routes. MCP will reuse those use cases; OAuth will replace the setup-specific code exchange.
- **Transport and authority.** The chosen transport is stateless Streamable HTTP with OAuth 2.1 and PKCE. Read-only or read/write grants are intersected with the user's permissions, with an active-grant check for immediate revocation. Resources and prompts remain outside the initial scope.

## 4. Data access

- **Drizzle ORM.** The TypeScript schema is the source of truth for generated SQL migrations, which are reviewed. Hand-written SQL remains available for constraints, extensions and queries that need Postgres features. Kysely and Prisma were considered; Drizzle keeps one schema source, at the cost of reviewing generated SQL.
- **One Postgres role** owns the schema without requiring superuser access, for compatibility with managed Postgres. Startup migrations are serialized with an advisory lock; readiness waits for them to succeed.
- **Transactions belong to use cases.** Operations that compose join the caller's transaction explicitly. There are no nested transactions or savepoints, and ORM details stay in database adapters ([RULE20](code-quality.md#layers-and-place)). External work happens outside database locks.
- **Files live in Postgres**, so their writes roll back with the owning data and database backups include their bytes. The referencing module owns authorization and lifetime; references protect files from premature deletion. Files are immutable, allowing permanent caching of each version. There is no generic download route. External images are normalized before storage to bound serving costs and remove metadata.
- **Extensions follow demand.** Vector search is introduced only when a feature needs it.

## 5. Events, jobs and workflows

- **Postgres is the durable work store.** pg-boss runs background jobs in the API process, using the instance's database. Enqueuing joins the business transaction, so rollback drops the work. Handlers run as the system, are idempotent and reject stale work; retries and terminal failures belong to the job lifecycle.
- **Events currently run in process after commit.** Rollback drops them. Handlers run sequentially and are awaited; handler failures are logged without undoing the committed operation. A crash between commit and dispatch can lose an event, an accepted limitation for now.
- **The durability decision is a transactional outbox**, written with the business change and audit record and drained by pg-boss. Delivery is ordered per entity and consumers remain idempotent. This avoids an external queue or a second workflow engine; the outbox is not implemented yet.
- **Workflows** such as approvals and onboarding are domain state machines, with durable jobs executing their steps.

## 6. Auth and sessions

- **Better Auth** owns authentication and session mechanics, backed by Postgres through Drizzle. Broccoli owns owner bootstrap and recovery, invitations, impersonation and password policy.
- **Sessions** use opaque database-backed tokens in HttpOnly cookies, CSRF protection and no cookie caching. Revocation and permission changes take effect immediately. Cookie security depends on the configured public origin (§12).
- **Mode is deployment configuration.** Self-hosted and managed instances have different bootstrap and sign-in trust boundaries; the mode is fixed at startup, not stored as a user setting.
- **Managed initialization.** A trusted accounts service assigns an instance its company and public origins with a short-lived, signed, instance-bound token. Assignment is accepted once, with idempotent retries and conflicting assignments refused. User routes stay unavailable until assignment.
- **Managed sign-in.** Short-lived signed tickets bind the accounts identity to the instance and browser request. Issuer, audience, origin, state and replay checks protect that boundary. The owner is identified by the accounts subject, never by email. The first valid sign-in claims the owner; managed instances do not expose self-hosted setup endpoints.
- **Slack connection.** An OAuth relay holds the Slack app secret, so instances need no copy. State and PKCE bind the response to the requesting browser. The Slack module owns the connection and encrypted token. Reads happen outside transactions, with a check that the connection is still current before their results are committed.
- **Self-hosted setup.** There is no public sign-up. The first browser becomes the setup holder, with authority limited to setup operations. Setup stays locked to that holder even after the session expires. Owner creation, setup completion and the end of the setup session are atomic. Setup endpoints enforce origin checks and rate limits.
- **Provisional owner.** A self-hosted demo gives the setup holder a credentialless owner with a fixed expiry that session renewal cannot extend. Before expiry, exiting the demo atomically removes its people and provisional owner and returns the browser to setup. After expiry, the instance requires a fresh database. A demo cannot become a permanent account by adding credentials.
- **External agent authority is separate.** Setup agents exchange a short-lived one-time code for a limited bearer session; only hashes are stored. An installer with server access can connect before a browser holds setup and choose the external agent only while no AI source is saved. Access requires the external agent to remain selected, no owner to exist, setup to be before review and any setup session to remain live. Agent credentials authorize only dedicated agent operations and never fall back to browser cookie authority. One agent is active at a time. It receives masked mapping questions unless the owner permits an original file read (§12), and it cannot approve the import. Approval is tied to the revision the owner reviewed.

## 7. Permissions and audit

- **Authorization belongs to the application layer.** Adapters establish identity; every use case checks its security context. Background work has explicit system authority. GraphQL denies access by default, with narrowly designated public bootstrap fields.
- **Current access is owner or system.** Finer permissions are designed as row scopes and field visibility. Scope filters must apply before pagination and counting, and unreadable fields must not leak through results, filtering or sorting. All adapters share these rules.
- **Audit records are append-only.** The audit design records the real actor, effective identity during impersonation, client and trace alongside the business change. Impersonation cannot change credentials or grants. Generic field history is outside the first release.
- **Custom fields do not use runtime DDL.** Their remaining design belongs with the feature that first needs them.

## 8. Frontend

- **React single-page app**, built with Vite and served by the API container with a deep-link fallback. There is no server-side rendering.
- **TanStack Router** owns navigation, authenticated routes and setup gates. Routes and the shell compose features; dependencies between features are explicitly constrained ([RULE38](code-quality.md#frontend)).
- **Apollo Client** owns server data through a normalized cache, generated operation types and component fragments with data masking. Creates and deletes refresh affected lists. Session changes clear the cache so one identity never inherits another's data.
- **State ownership.** Navigable state, such as filtering, sorting and paging, lives in validated search parameters. React state holds local UI state ([RULE37](code-quality.md#frontend)).
- **Shared UI.** shadcn/ui on Base UI, Tailwind design tokens and Phosphor icons provide the common UI. Lists share interaction patterns while features own their queries and validation. Fonts are bundled to avoid third-party browser requests. The initial theme is light.
- **Forms** use TanStack Form and Zod, sharing input validation with the API where practical.
- **Language and dates.** English is the first language, with user-facing strings ready for translation. Calendar dates retain their meaning in every time zone; date-times stay strings until display formatting ([RULE29](code-quality.md#data-configuration-and-logs)).

## 9. Testing

- **Vitest at three levels:** pure domain and frontend unit tests, use-case integration tests against real Postgres, and a smaller set of API end-to-end tests over HTTP. Most behavior belongs in integration tests.
- **Isolation.** Each test has an isolated database, allowing parallel runs. Fixtures use repositories independently of the use cases under test; external systems are the mock boundary.
- **UI checks are manual** for now, with no component or browser test suite. AI evals call real models on demand and stay outside ordinary CI.

Test design and execution belong in [testing.md](testing.md). UI verification starts with [QA setup](qa/setup.md).

## 10. Tooling and layout

- **pnpm workspaces and Turborepo** organize the monorepo. Packages live under `packages/`; shared packages are added when there is actual code to share. The repository root stays small ([RULE8](code-quality.md#modules-and-files)).
- **Builds** use Vite for the web app and tsdown for the API, with bundler-style TypeScript module resolution.
- **Automated quality checks** cover formatting, lint, types, module boundaries, duplicate code and tests. GitHub Actions also scans for secrets. Containerized CI jobs reach their isolated services over the container network.

## 11. Development environment

- **Compose mirrors self-hosting**, with development overrides for source mounts and live reload. Each checkout or worktree has its own services, network and persistent development data; dynamically assigned ports allow parallel stacks.
- **Shutdown preserves data.** Database reset is explicit, and cleanup targets only identified abandoned checkouts. Integration and end-to-end tests use a separate disposable Postgres instance.

Installation is in the [README](../README.md), setup in the [setup guide](guides/setup-guide.md), and test procedures in [testing.md](testing.md).

## 12. Configuration, secrets, observability and self-hosting

- **Configuration** comes from environment variables validated with Zod at startup. Mode-specific settings cannot compete with the other mode's settings ([RULE30](code-quality.md#data-configuration-and-logs)).
- **Public origin.** A self-hosted instance can use a configured browser-facing origin or trust the request address when unset. Secure cookies require an explicitly configured HTTPS origin; deployments must preserve that trust boundary.
- **Secrets survive restarts and database resets.** Generated encryption keys and cookie secrets live in restricted files in the data folder, outside the database. Third-party credentials are encrypted with AES-256-GCM; the database holds hashes and ciphertext, never encryption keys. Backups must include both the database and secrets volume.
- **Brand lookup is optional.** Self-hosted instances make no brand-lookup request by default. When enabled, the service receives only the owner's email domain, never the address, and the returned logo is stored locally.
- **Observability.** Structured logs use pino and carry identifiers, never contents ([RULE31](code-quality.md#data-configuration-and-logs)). Separate liveness and readiness probes distinguish a running process from one ready to serve after migrations and required services start. No third-party error service is required.
- **Self-hosting** uses one image for the API, static web app and migrations, plus Postgres on a private Compose network. Publishing the database requires password authentication. The updater design pins images by digest, checks health and rolls back failed updates. Backups use Postgres tools rather than a product-specific engine. Managed instances use the same image with centralized initialization and model credentials.
- **AI access is centralized.** One integration owns model transport. Managed instances use the managed provider; self-hosted owners choose Broccoli AI, their own provider key or an external agent. An explicit choice takes precedence over environment defaults. Provider keys are encrypted; the Broccoli AI token persists outside the database so resetting it cannot extend the trial.
- **Personal data is masked by default.** Mapping questions contain only the data needed for the decision, with identifying strings replaced before they reach a model or external agent. Model requests require providers that retain nothing. With an external agent selected, Broccoli makes no model requests.
- **Original file read is an explicit exception.** The owner consents per file to its full contents, including personal data, going to the selected AI source. PDFs require this because their rows cannot be masked. Consent is bound to the displayed provider; a provider change or transfer from agent to model requires fresh consent. File names are never sent. Consent lasts until setup completes, including after Back from setup's last step.
