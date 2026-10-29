# Permissions

Who may do what in Broccoli. Use cases ask their security context; nothing else decides. The code lives in `packages/api/src/core/security`.

## Primitives

- **Permission profile** (`EMPLOYEE`, `ADMIN`, `OWNER`): a named list of grants and operations. Every signed-in user has `EMPLOYEE` and any number of others; their rights are the union.
- **Object** (`employee`): a kind of record permissions apply to.
- **Action** (`create`, `read`, `update`, `delete`): what can be done to one record of an object.
- **Subject**: whom a record is about, which scopes are measured against. An employee is their own subject; a time off request's subject is the requester. A record about nobody is **public**: every read grant on its object reaches it, whatever its scope, and only grants on `all` write it. Subjects are employees today; a later kind, such as a legal entity, is fixed in core and resolved where scopes resolve, without changing a contract.
- **Scope** (`self`, `direct_reports`, `all_reports`, `managers`, `all`): which subjects a grant reaches, relative to the caller's employee: the caller, people they manage directly, everyone below them in the reporting line, everyone above them in it, or everyone. Neither report scope includes the caller.
- **Grant** (`{ key, object, actions, scope, fields? }`): actions on one object within one scope. `fields` limits the write actions; `"*"` means every ordinary editable field. `key` is stable, so later stored changes can name a built-in grant.
- **Operation** (`MANAGE_WORKSPACE`, `RESET_WORKSPACE`): something done outside any record.

## Profiles

- `EMPLOYEE`: read on `all`; update on `self` (first name, last name, photo); update on `all_reports` (first name, last name, photo, job title). No operations.
- `ADMIN`: create, read, update and delete on `all`, every field; `MANAGE_WORKSPACE`.
- `OWNER`: Admin's grants and operations, shared in code rather than linked, plus `RESET_WORKSPACE`. A release that changes Admin's definition changes both; an admin's stored edits to the Admin profile, once the profile editor exists, will not reach the owner.

- The profiles given to a user are stored in `user_permission_profiles` (`ADMIN` today). `EMPLOYEE` is never stored: everyone has it. `OWNER` is never stored either: the instance's owner has it. Employees who never sign in have none.
- Several profiles let an admin combine roles instead of building one per combination; grants only add, so the union never conflicts.
- A manager is not a profile. Having reports gives the report-scoped grants at once; losing them takes the rights away.
- Profiles do not extend each other: a person who needs two sets of rights holds two profiles.
- All three profiles are built in: defined in code and changed by releases.

## How a check resolves

For an action on a record, the caller's grants for that object that list the action and whose scope contains the record's subject are combined: allowed if any matches, and the writable fields are the union of their `fields`. An update that sends any other field is refused as a whole, naming each such field. For an operation, the profile holds it or not. Broccoli itself (system) passes every check; the setup holder and the owner's external agent have no profile.

`SecurityContext` answers in one call:

- `require(operation)` / `can(operation)`; `requireSetupAccess(operation)` also lets the setup holder in; `requireSystem()` for Broccoli's own work.
- `recordScope(object, action)`: the subjects the caller's grants reach, as `"none"`, `"all"` or a list; read once per request. It never refuses.
- `requireInScope(object, action, subject)` and `requireWrite(object, subject, fields)`.
- `recordAccess(object, subjects)`, which `AnyRecord.access` shows so the web app offers only what the caller may do.
- `requireEveryRecord(object, action)`: creating a record tied to nobody yet, and ids that name no record, such as a deleted one's history.

Every read takes one of three shapes:

- **Page**: the list query adds `inRecordScope(scope, subjectColumn)` before its limit, so search, order, cursor and `hasNextPage` see only records in scope. It refuses a caller with no grant (`"none"`).
- **Batch**: records loaded by id keep those whose subject `isInRecordScope`. A batch about related records, such as each employee's manager, checks both the records asked about and the records returned. Records inside another result are hidden, never refused: so are a history line's values that name a record the reader may not read, which show as hidden (`oldHidden`/`newHidden`) while the line stays.
- **Single**: `requireInScope` on the record's subject.

A write checks its write grant, and its result shows the record only when the caller may also read it; otherwise the record is null and the write still happens.

**Fixed rules**, applied in the same checks: the owner's profile never changes, and the owner's employee is never deleted. The second is about the `employee` object only: the owner's other records can be deleted.

## Recipes

- **Add an operation**: add it to `OPERATIONS` in `permissions.ts` and to the `Operation` enum in `core/graphql/schema.graphql`, give it to the profiles that hold it, and add its refusal message to `OPERATION_REFUSALS`. Use cases call `ctx.require("…")`.
- **Add an object**: add it to `PermissionObjects`, give `ADMIN` a grant over every action on `all`, give `EMPLOYEE` only what it needs, and register the record type with `permissions: { object, editableFields }` so `AnyRecord.access` works.
- **Add an action**, such as `approve`: add it to `RecordAction` and list it in the grants that allow it. No grant gets a new action by itself.
- **Add a record type**: register it with `subjectsOf(ids)` (each existing record's subject, or `"public"`), `loadRecords(ids)` and, when a change field holds another record's id, `references` (`{ manager: "employee" }`); core then decides its history, `RecordChange.record` and `AnyRecord.access`. Its list query adds `inRecordScope(await ctx.recordScope(object, "read"), subjectColumn)`; its write results go through the read scope. Creating a record with a subject checks `requireInScope(object, "create", subject)`.
- **Add a scope**: add it to `Scope` and resolve it in `PrincipalSecurityContext.reachedBy`, the one place lists and single checks share, through `EmployeeDirectory`: the employees module answers who is above and below whom.
