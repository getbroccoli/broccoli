# Testing

How we write tests in Broccoli. The decisions behind them are in [§9 of the architecture](architecture.md#9-testing).

## What to test

Three layers, most tests in the middle one:

- **Domain rules** with unit tests next to the code, named `<subject>.test.ts`. Domain code is pure, so these tests need no mocks.
- **Use cases** with integration tests next to them, named `<use-case>.int.test.ts`. They call the module's use-case factory directly against a real, migrated Postgres, with any actor built in the test (`OWNER`, a non-owner, `null`). Permissions, validation, uniqueness, paging, transactions, audit and events are verified here. The fixtures in `packages/api/test/integration` give each test its own database (`orm`) and a `seed`.
- **API wiring** with a few end-to-end tests under `packages/api/test/e2e`. They start the real server and call GraphQL over HTTP: the session becomes the actor, each operation reaches its use case once on the happy path, errors keep their format. Rules already covered by integration tests are not repeated here.
- **Bugs** with a test that reproduces the bug, written before the fix, at the lowest layer that shows it.

## What not to test

- Trivial code: constants, types, pass-through glue and placeholders.
- Implementation details: private helpers, call order, or mocks of our own modules.
- The frontend, for now.
- Configuration files by matching their text. Run the tool that reads them instead.

## Writing a test

- Work test-first: a failing test, the smallest code that passes, then refactor.
- Name the test after the expected behaviour: `it("rejects a request that overlaps an approved absence")`.
- Cover one behaviour per test, with short setup and a visible arrange, act and assert.
- Keep tests deterministic. Inject the clock and ID generators. No sleeps, no network, no dependence on test order.
- Build test data with `seed` (`TestSeed` in `packages/api/test/support`), which goes through the public use cases, never raw inserts. Set only the fields the test is about. A module adds its own seed methods.
- Assert on outcomes a caller can see: return values, GraphQL responses, state read back through public queries, and emitted events.
- Mock only external systems such as email, Slack and third-party HTTP. Never mock Postgres.
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
