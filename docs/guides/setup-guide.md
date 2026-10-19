# Rebuild

After pulling changes, run `docker compose up --build` to rebuild the image.

# Drop the database

To restart setup with an empty database, run:

```sh
docker compose down --volumes
docker compose up --build
```
