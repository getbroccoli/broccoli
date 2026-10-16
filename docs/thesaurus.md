# Thesaurus

The words Broccoli's code and docs use, and what each one means. Only Broccoli's own terms belong here; well-known ones such as job, model or mapping do not.

- **Instance**: one installation of Broccoli with its own database, for one company. The `instance` table holds its single row.
- **Mode**: how the instance is run, `self_hosted` or `managed`, set by `BROCCOLI_MODE`.
- **Owner**: the user who set up the instance. Identified by the user id, never by the email.
- **User**: a person who can sign in (Better Auth's `user` table).
- **Account**: one way a user signs in, such as a password (`credential`) or managed sign-in (Better Auth's `account` table). A user can have several.
- **Session**: a signed-in browser, carried in a cookie and stored in the `session` table.
- **Setup**: the first-run flow of a new instance, step by step: the company name, then the import of its people, then on self-hosted instances the owner account, created last by the setup holder through `POST /api/auth/setup`. A managed owner signs in before setup.
- **Setup step**: where a new instance is in setup: `company`, `import`, `owner` (self-hosted only), `done`. Not to be confused with employee onboarding, an HR process. The web app's step list shows one more, the setup review step, inside `import`.
- **Setup session**: on a self-hosted instance before the owner exists, the server-side record that one browser holds setup: the hash of a token in the `broccoli_setup` cookie, valid three days after the holder last opened setup. Setup stays locked to it, even after it expires, until `reset-setup` frees it.
- **Setup holder**: the browser holding the setup session, and the security context it acts as. It may do the setup steps and nothing else.
- **Setup review step**: the setup page after the import step, "Review your people", where the owner sees every import employee, read-only, and approves. Only the web app knows it: the instance stays at the `import` setup step until Approve.
- **Data folder**: `DATA_DIR`, the folder for files that must survive restarts, such as `secrets/`.
- **File**: bytes with a MIME type that a module stores in the `files` table, such as the company logo. The module that references it decides who may see it.
- **Primitive**: one of the four building blocks every HR feature is made of: records, tasks, calendar and processes.
- **Record**: a module's main entity, such as an employee or the company.
- **Employee**: someone who works for the company; later also agents and robots. The People area lists employees.
- **Security context**: who is calling application code: a signed-in user, and whether they are the owner; the setup holder; or the system.
- **System**: Broccoli acting on its own, such as creating the owner at setup or seeding the demo company after it.
- **Company**: the business the instance belongs to; its name and logo. One per instance.
- **Brand lookup**: finding a company's name and logo from the owner's email domain, through the service at `BRAND_LOOKUP_URL`.
- **Domain event**: something that happened in the domain, published by one module in a transaction and handled by others after the commit, such as `instance.owner_claimed`.
- **Demo data**: the sample company a new instance starts with, marked so that clearing it removes nothing else. People added while it is present stay.
- **Import**: every import source and its records, waiting for review before they become records of their module. One per instance.
- **Import source**: one place people come from, such as the connected Slack workspace or an uploaded file. It owns its import records.
- **File source**: a staff file the owner uploaded as an import source. Its records come from the file's rows once the file is mapped.
- **Import record**: one record as one source proposes it, such as an import employee, with the source's values as they came; not yet a record of its module.
- **Ready import employee**: an import employee complete enough to become an employee under the employee rules. The others are incomplete import employees.
- **Approve**: turns the ready import employees into employees and completes the import step, once; incomplete ones stay in the import.
- **Slack connection**: the instance's connected Slack workspace and its encrypted token, owned by the `slack` module. Connecting imports nothing; the import reads the workspace when the owner asks.
