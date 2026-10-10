#!/bin/sh
# Starts this checkout's Broccoli stack and prints its URL. Unless HOST_WEB_PORT is set
# in the shell or .env, Docker picks a free host port, so worktrees run side by side.
set -eu
cd "$(dirname "$0")/../.."

DEFAULT_HOST_WEB_PORT=0 docker compose up --build --detach --wait
address=$(docker compose port broccoli 3000)
echo "Broccoli is running at http://localhost:${address##*:}"
echo "Stop it with: docker compose down"
