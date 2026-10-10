# Thesaurus

The words Broccoli's code and docs use, and what each one means.

- **Instance**: one installation of Broccoli with its own database, for one company. The `instance` table holds its single row.
- **Mode**: how the instance is run, `self_hosted` or `managed`, set by `BROCCOLI_MODE`.
- **Owner**: the user who set up the instance. Identified by the user id, never by the email.
- **User**: a person who can sign in (Better Auth's `user` table).
- **Account**: one way a user signs in, such as a password (`credential`) or managed sign-in (Better Auth's `account` table). A user can have several.
- **Session**: a signed-in browser, carried in a cookie and stored in the `session` table.
- **Setup token**: the one-time secret that lets the operator create the owner on a new self-hosted instance.
- **Setup link**: `<PUBLIC_URL>/setup#token=…`, logged while no owner exists.
- **Onboarding step**: where a new instance is in its first-run flow: `owner`, `company`, `done`.
- **Data folder**: `DATA_DIR`, the folder for files that must survive restarts, such as `secrets/`.
