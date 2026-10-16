<p align="center">
  <a href="https://getbroccoli.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.svg">
      <img src=".github/assets/logo.svg" alt="Broccoli" width="96">
    </picture>
  </a>
</p>

<h1 align="center">Broccoli</h1>

<p align="center">
  <strong>The open-source Employee Operations System.</strong><br>
  Own your Employee Ops. Run it where you already work. Built for the age of agents.
</p>

<p align="center">
  <a href="https://getbroccoli.com">Website</a> ·
  <a href="https://getbroccoli.com/#install">Join the waitlist</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-5E9072" alt="License: AGPL-3.0"></a>
  <a href="https://github.com/getbroccoli/broccoli/actions/workflows/secret-scan.yml"><img src="https://github.com/getbroccoli/broccoli/actions/workflows/secret-scan.yml/badge.svg" alt="CI"></a>
</p>

## Quick install

```sh
docker compose up
```

Open http://localhost:8080 right away: the first browser to open it holds setup, and you create your account at the end. Broccoli listens on this machine only; to reach it from elsewhere, put a reverse proxy in front and set `SELF_HOSTED_PUBLIC_URL` to its address.

If setup is held by a browser you no longer have, free it with `docker compose exec broccoli reset-setup`.

## License

Copyright (C) 2026 Minari Limited.

Broccoli is open source under the [GNU Affero General Public License v3.0](LICENSE).
The Broccoli name and logo are covered by our [trademark policy](.github/TRADEMARK.md).
