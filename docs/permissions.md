# Permissions

Who may do what in Broccoli. Use cases ask their security context; nothing else decides. The code lives in `packages/api/src/core/security`.

## Primitives

- **Permission profile** (`EMPLOYEE`, `ADMIN`, `OWNER`): a named list of grants and operations. Every signed-in user has `EMPLOYEE` and any number of others; their rights are the union.
- **Object** (`employee`): a kind of record permissions apply to.
- **Action** (`create`, `read`, `update`, `delete`): what can be done to one record of an object.
- **Scope** (`self`, `direct_reports`, `all_reports`, `all`): which records a grant reaches, relative to the caller's employee: the caller, people they manage directly, everyone below them in the reporting line, or everyone. Neither report scope includes the caller.
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

For an action on a record, the caller's grants for that object that list the action and whose scope contains the record are combined: allowed if any matches, and the writable fields are the union of their `fields`. An update that sends any other field is refused as a whole, naming each such field. For an operation, the profile holds it or not. Broccoli itself (system) passes every check; the setup holder and the owner's external agent have no profile.

`SecurityContext` answers in one call:

- `require(operation)` / `can(operation)`; `requireSetupAccess(operation)` also lets the setup holder in; `requireSystem()` for Broccoli's own work.
- `requireEveryRecord(object, action)`: lists while reads reach everyone, and creating a record.
- `requireInScope(object, action, subjectEmployeeId)` and `requireWrite(object, subjectEmployeeId, fields)`.
- `recordAccess(object, subjectEmployeeId)`, which `AnyRecord.access` shows so the web app offers only what the caller may do.

**Fixed rules**, applied in the same checks: the owner's profile never changes, and the owner's employee is never deleted.

## Recipes

- **Add an operation**: add it to `OPERATIONS` in `permissions.ts` and to the `Operation` enum in `core/graphql/schema.graphql`, give it to the profiles that hold it, and add its refusal message to `OPERATION_REFUSALS`. Use cases call `ctx.require("…")`.
- **Add an object**: add it to `PermissionObject`, give `ADMIN` a grant over every action on `all`, give `EMPLOYEE` only what it needs, and register the record type with `permissions: { object, editableFields }` so `AnyRecord.access` works.
- **Add an action**, such as `approve`: add it to `RecordAction` and list it in the grants that allow it. No grant gets a new action by itself.
- **Add a scope**: add it to `Scope`, resolve it in `PrincipalSecurityContext` through `EmployeeDirectory` (the employees module answers who is above whom), and filter lists before pagination when a read narrows.
