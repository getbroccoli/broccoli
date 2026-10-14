# Thesaurus

The words Broccoli's code and docs use, and what each one means.

- **Instance**: one installation of Broccoli with its own database, for one company. The `instance` table holds its single row.
- **Mode**: how the instance is run, `self_hosted` or `managed`, set by `BROCCOLI_MODE`.
- **Owner**: the user who set up the instance. Identified by the user id, never by the email.
- **User**: a person who can sign in (Better Auth's `user` table).
- **Account**: one way a user signs in, such as a password (`credential`) or managed sign-in (Better Auth's `account` table). A user can have several.
- **Session**: a signed-in browser, carried in a cookie and stored in the `session` table.
- **Setup**: the first-run flow of a new instance, step by step: the owner account (on self-hosted instances the first visitor creates it, once, through `POST /api/auth/setup`), then the company name.
- **Setup step**: where a new instance is in setup: `owner`, `company`, `done`. Not to be confused with employee onboarding, an HR process.
- **Data folder**: `DATA_DIR`, the folder for files that must survive restarts, such as `secrets/`.
- **File**: bytes with a MIME type that a module stores in the `files` table, such as the company logo. The module that references it decides who may see it.
- **Primitive**: one of the four building blocks every HR feature is made of: records, tasks, calendar and processes.
- **Record**: a module's main entity, such as an employee or the company.
- **Employee**: someone who works for the company; later also agents and robots. The People area lists employees.
- **Security context**: who is calling application code: a signed-in user, and whether they are the owner, or the system.
- **System**: Broccoli acting on its own, such as creating the owner at setup or seeding the demo company after it.
- **Company**: the business the instance belongs to; its name and logo. One per instance.
- **Brand lookup**: finding a company's name and logo from the owner's email domain, through the service at `BRAND_LOOKUP_URL`.
- **Domain event**: something that happened in the domain, published by one module in a transaction and handled by others after the commit, such as `instance.owner_claimed`.
- **Demo data**: the sample company a new instance starts with, marked so that clearing it removes nothing else. People added while it is present stay.
