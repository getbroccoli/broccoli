# Testing

How we write tests in Broccoli. The decisions behind them are in [§9 of the architecture](architecture.md#9-testing).

## What to test

Three layers, most tests in the middle one:

- **Domain rules** with unit tests next to the code, named `<subject>.test.ts`. Domain code is pure, so these tests need no mocks.
- **Use cases** with integration tests next to them, named `<use-case>.int.test.ts`. They call the module's use-case factory directly against a real, migrated Postgres, with any security context built in the test (`OWNER`, `NON_OWNER` or `SYSTEM`); application code never sees an anonymous caller. Permissions, validation, uniqueness, paging, transactions, audit and events are verified here. The `test` fixtures in `packages/api/test/support`, shared by all layers that need Postgres, give each test its own database (`orm`), a `seed`, and `transact` for transactions whose events nobody receives.
- **API wiring** with a few end-to-end tests under `packages/api/test/e2e`. They start the real server and call GraphQL over HTTP: the session becomes the security context and a request without one is refused, each operation reaches its use case once on the happy path, errors keep their format. Rules already covered by integration tests are not repeated here.
- **Bugs** with a test that reproduces the bug, written before the fix, at the lowest layer that shows it.

## What not to test

The rules are [RULE40 and RULE41](code-quality.md#tests). Two of them are choices for now: frontend components and pages get no tests, only pure frontend functions such as search-param parsing; and integrations (`src/integrations/`) are thin clients over shared helpers such as `fetchJson`, which have their own tests, so use-case tests replace them with a fake and end-to-end tests run them against a local fake service.

## Writing a test

- Work test-first: a failing test, the smallest code that passes, then refactor.
- Follow [RULE42 to RULE46](code-quality.md#tests); a name reads like `it("rejects a request that overlaps an approved absence")`.
- Build test data with `seed` (`TestSeed` in `packages/api/test/support`), which inserts through each module's repository, skipping use cases, permissions, audit and events. Seed values must be what the app would store (normalised, such as a lowercased email). Set only the fields the test is about. A module adds its own seed methods.
- Build the use cases under test with the module's helper in `#test/support`, such as `companyUseCases(orm, { brandLookup })`. It fills every dependency with a test default (a new event bus, a silent logger, no external calls), so a test passes only the one it is about and the factory call is not repeated in every test. A module whose factory needs more than `{ orm }` adds such a helper.
- Core tests publish the test-only `example.happened` domain event (`EXAMPLE_PAYLOAD`), never a module's event, so they do not depend on any module.
- Assert on outcomes a caller can see: return values, GraphQL responses, state read back through public queries, and emitted events.
- External systems such as email, Slack and third-party HTTP get fakes. `TestSecurityContext` from `#test/support` answers whatever the test sets; `OWNER`, `NON_OWNER` and `SYSTEM` are instances of it.
- Add property-based tests only when the module design agrees on them.

## Running integration and end-to-end tests

Both need Postgres. Start this checkout's throwaway instance, run the tests, and stop it when you are done:

```sh
docker compose up -d --wait postgres-test
pnpm test:integration
pnpm test:e2e
docker compose rm --stop --force postgres-test
```

Each checkout gets its own container on a free port, so worktrees can run the tests at the same time. The data lives in memory; removing the container discards it, including databases left by an interrupted run. To use another Postgres server, set `TEST_DATABASE_URL` to an admin connection URL; the tests create and drop only databases named `broccoli_test_*`.

## Evals

An eval checks one of the product's AI decisions against the real model, such as which row of a file is its header and which column holds which field. It runs the module's use cases like an integration test, with the real model instead of the fake one, and lives next to the module as `evals/<decision>.eval.test.ts` with its cases in `evals/cases/`: an input file and `<case>.expected.json`, the result the file must produce, written by hand from the rules and never copied from a run.

Run the evals when you change the model, a question or what is sent to the model, and paste the summary into the pull request:

```sh
docker compose up -d --wait postgres-test
EVAL_OPEN_ROUTER_KEY=… pnpm --filter @broccoli/api eval
EVAL_OPEN_ROUTER_KEY=… pnpm --filter @broccoli/api eval -t simple   # one case
```

They call OpenRouter with your key, which costs money: a full run of the import cases costs well under one cent. Each case is one test: it fails when the saved result differs from the expected one, lists the personal values of the file that reached the model and prints what its model calls cost; the run ends with its total cost. Evals never run in `pnpm check` or CI.
