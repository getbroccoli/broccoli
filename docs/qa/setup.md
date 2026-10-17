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

Until the company has a name, setup opens `/setup/company`. Call the `company { update(input: …) }` mutation in the browser's devtools console on the app's tab, then reload:

```js
await fetch("/api/graphql", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    query:
      'mutation { company { update(input: { name: "Acme Corp" }) { company { id } error { __typename ... on Error { message } } } } }',
  }),
});
```

Or from a terminal with the cookie jar:

```sh
curl -b cookies -H 'content-type: application/json' "$URL/api/graphql" \
  -d '{"query":"mutation { company { update(input: { name: \"Acme Corp\" }) { company { id } error { __typename ... on Error { message } } } } }"}'
```

## Skip the import

After the company step, setup opens `/setup/import`. Choose "Skip for now", or call `mutation { import { skip { import { id } } } }` the same way.

## Create the owner

The last step opens `/setup`. Enter `owner@example.com` and a password of at least 8 characters, then choose "Create account and finish". This signs you in and ends on `/people`, which then shows the demo company.

From a terminal:

```sh
curl -c cookies -b cookies -H 'content-type: application/json' -H "origin: $URL" \
  -d '{"email":"owner@example.com","password":"correct-horse-battery"}' "$URL/api/auth/setup"
```

## Sign in again

Once the owner exists, setup answers `OWNER_EXISTS`. Sign in with the same body at `/api/auth/sign-in/email`, from the console or with `curl -c cookies`.

## Add employees

With the session, call the `employee { create(input: …) }` mutation:

```sh
curl -b cookies -H 'content-type: application/json' "$URL/api/graphql" \
  -d '{"query":"mutation { employee { create(input: { firstName: \"Avery\", lastName: \"Abbott\", email: \"avery@example.com\", jobTitle: \"Designer\", startDate: \"2024-03-04\" }) { employee { id } error { __typename ... on Error { message } ... on InvalidInputError { fields { field code } } } } } }"}'
```
