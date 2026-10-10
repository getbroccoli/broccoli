# Contributing to Broccoli

> **We don't accept outside pull requests yet.** Pull requests are open to the
> maintainers only. Broccoli stays open source: you can read, run and fork the
> code.

The best way to help is a detailed issue: the problem, who it affects, and how
you expect Broccoli to behave. Search [existing issues](https://github.com/getbroccoli/broccoli/issues)
first.

For security problems, don't open an issue; follow [SECURITY.md](SECURITY.md).

## Development

You need Docker and pnpm. Each checkout or worktree runs its own stack:

```sh
pnpm dev        # start the development stack on a free port and follow its logs
pnpm dev:prune  # remove stacks of checkouts that no longer exist
```

To run the production image from a worktree on a free port:

```sh
HOST_WEB_PORT=0 docker compose up --build --detach --wait
docker compose port broccoli 3000
```
