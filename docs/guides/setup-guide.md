# Rebuild

After pulling changes, run `docker compose up --build` to rebuild the image.

# Drop the database

To restart setup with an empty database, run:

```sh
docker compose down --volumes
docker compose up --build
```

# Email

Broccoli sends no email until you choose how in **Settings → Email**: your own mail server with an SMTP URL such as `smtps://user:password@smtp.example.com:465`, or a [Resend](https://resend.com) API key, each with the address emails come from. "Send me a test email" checks the choice. While email is chosen, people with a password can reset a forgotten one from the sign-in page; set `SELF_HOSTED_PUBLIC_URL` so the links in emails use your domain.
