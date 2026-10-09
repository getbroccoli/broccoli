# Testing

How we write tests in Broccoli. The decisions behind them are in [§9 of the architecture](architecture.md#9-testing).

## What to test

- **Domain rules** with unit tests next to the code, named `<subject>.test.ts`. Domain code is pure, so these tests need no mocks.
- **Use cases and adapters** with end-to-end API tests under `packages/api/test/e2e`. They call GraphQL over HTTP against a real Postgres. Permissions, audit and transactions are verified here.
- **Bugs** with a test that reproduces the bug, written before the fix.

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
- Build test data with the module's factories, which go through public use cases. Set only the fields the test is about.
- Assert on outcomes a caller can see: return values, GraphQL responses, state read back through public queries, and emitted events.
- Mock only external systems such as email, Slack and third-party HTTP. Never mock Postgres.
- Add property-based tests only when the module design agrees on them.

## Running end-to-end tests

End-to-end tests need Postgres. Start this checkout's throwaway instance, run the tests, and stop it when you are done:

```sh
docker compose --profile test up -d --wait
pnpm test:e2e
docker compose --profile test down
```

Each checkout gets its own container on a free port, so worktrees can run the tests at the same time. The data lives in memory; `down` discards it, including databases left by an interrupted run. To use another Postgres server, set `TEST_DATABASE_URL` to an admin connection URL; the tests create and drop only databases named `broccoli_test_*`.
