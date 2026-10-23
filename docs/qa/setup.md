# QA setup

How to get a development stack with a signed-in owner before a manual check. Use generated demo data only, with `example.com` addresses.

## Start the stack

Run `pnpm dev` and set `URL` to the address it prints. Development data is kept between runs; an owner created once stays. `pnpm dev --drop-db` starts on a database without an owner.

## Hold setup

On a database without an owner, the first browser to open the app holds setup and lands on `/setup/company`; every other browser lands on `/setup/in-progress`. To free setup held by another browser, restart the dev stack with `pnpm dev --drop-db`.

From a terminal, keep the setup cookie in a cookie jar instead:

```sh
curl -c cookies -b cookies -X POST -H "origin: $URL" "$URL/api/auth/setup/start"
```

## Name the company

Until the company has a name, setup opens `/setup/company`. Call the `updateCompany(input: …)` mutation in the browser's devtools console on the app's tab, then reload:

```js
await fetch("/api/graphql", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    query:
      'mutation { updateCompany(input: { name: "Acme Corp" }) { company { id } error { __typename ... on Error { message } } } }',
  }),
});
```

Or from a terminal with the cookie jar:

```sh
curl -b cookies -H 'content-type: application/json' "$URL/api/graphql" \
  -d '{"query":"mutation { updateCompany(input: { name: \"Acme Corp\" }) { company { id } error { __typename ... on Error { message } } } }"}'
```

## Skip the import

After the company step, a self-hosted setup opens `/setup/ai`: choose "Explore the demo" there, or "Continue" and then "Explore the demo" on `/setup/import`. Either fills the demo company and signs you in as the demo's owner, without an account; `POST /api/auth/setup/demo` does the same. "Exit demo" in the green banner deletes the demo and takes setup back to the company step.

For an owner with an account and the demo company, start the demo from a terminal with the cookie jar instead, then create the owner below:

```sh
curl -b cookies -H 'content-type: application/json' "$URL/api/graphql" \
  -d '{"query":"mutation { startDemo { import { id } } }"}'
```

## Create the owner

After an import or the terminal demo start, the last step opens `/setup`. Enter `owner@example.com` and a password of at least 8 characters, then choose "Create account". This signs you in and ends on `/people`.

From a terminal:

```sh
curl -c cookies -b cookies -H 'content-type: application/json' -H "origin: $URL" \
  -d '{"email":"owner@example.com","password":"correct-horse-battery"}' "$URL/api/auth/setup"
```

## Sign in again

Once the owner exists, setup answers `OWNER_EXISTS`. Sign in with the same body at `/api/auth/sign-in/email`, from the console or with `curl -c cookies`.

## Add employees

With the session, call the `createEmployee(input: …)` mutation:

```sh
curl -b cookies -H 'content-type: application/json' "$URL/api/graphql" \
  -d '{"query":"mutation { createEmployee(input: { firstName: \"Avery\", lastName: \"Abbott\", email: \"avery@example.com\", jobTitle: \"Designer\", startDate: \"2024-03-04\" }) { employee { id } error { __typename ... on Error { message } ... on InvalidInputError { fields { field code } } } } }"}'
```
