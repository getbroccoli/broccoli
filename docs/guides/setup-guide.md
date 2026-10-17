# Setup guide

How a new self-hosted Broccoli is set up after `docker compose up`.

## Open it right away

Open http://localhost:8080, or the address of your server, as soon as it is up. The first browser to open a new Broccoli holds setup: only that browser can continue it, and every other browser sees "Setup is in progress on another device". The hold lasts three days after you last opened setup.

## The steps

1. **Company**: its name and logo.
2. **Add your people**: from Slack and staff files, then review them and approve, or skip for now.
3. **Create your account**: the email and password you sign in with. You become the owner, and setup is done.

## Behind a reverse proxy

Set `SELF_HOSTED_PUBLIC_URL` to the address people use, such as `https://hr.example.com`, so Broccoli trusts requests from it and sends its cookies over HTTPS only.

## Lost the browser

If setup is held by a browser you no longer have, free it on the server:

```sh
docker compose exec broccoli reset-setup
```

The next browser to open Broccoli continues setup from the same step, with everything entered so far. Once the owner exists, setup is over and the command refuses; sign in instead.
