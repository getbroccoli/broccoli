# QA setup

How to get a development stack with a signed-in owner before a manual check. Use generated demo data only, with `example.com` addresses.

## Start the stack

Run `pnpm dev` and set `URL` to the address it prints. Development data is kept between runs; an owner created once stays.

## Create the owner

On a database without an owner, every page opens `/setup`. Enter `owner@example.com` and a password of at least 8 characters, then choose "Next: set up company". This works once per database and signs you in.

From a terminal, keep the session in a cookie jar instead:

```sh
curl -c cookies -H 'content-type: application/json' -H "origin: $URL" \
  -d '{"email":"owner@example.com","password":"correct-horse-battery"}' "$URL/api/auth/setup"
```

## Name the company

Until the company has a name, every signed-in page opens `/setup/company`. Call the `company { update(input: …) }` mutation in the browser's devtools console on the app's tab, then reload:

```js
await fetch("/api/graphql", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    query: 'mutation { company { update(input: { name: "Example Inc" }) { id } } }',
  }),
});
```

Or from a terminal with the cookie jar:

```sh
curl -b cookies -H 'content-type: application/json' "$URL/api/graphql" \
  -d '{"query":"mutation { company { update(input: { name: \"Example Inc\" }) { id } } }"}'
```

## Sign in again

Once the owner exists, setup answers `OWNER_EXISTS`. Sign in with the same body at `/api/auth/sign-in/email`, from the console or with `curl -c cookies`.

## Add employees

With the session, call the `employee { create(input: …) }` mutation:

```sh
curl -b cookies -H 'content-type: application/json' "$URL/api/graphql" \
  -d '{"query":"mutation { employee { create(input: { firstName: \"Avery\", lastName: \"Abbott\", email: \"avery@example.com\", jobTitle: \"Designer\", startDate: \"2024-03-04\" }) { id } } }"}'
```
