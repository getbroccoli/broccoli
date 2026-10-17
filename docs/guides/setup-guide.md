# Self-hosted setup guide

## Troubleshooting

### "Setup is in progress on another device"

The first browser to open a new Broccoli holds setup until the owner account is created. If setup is held by a browser you no longer have, start over on an empty database. This deletes everything entered during setup:

```sh
docker compose down --volumes
docker compose up
```
