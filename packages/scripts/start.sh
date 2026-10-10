#!/bin/sh
# Starts this checkout's Broccoli stack and prints its URL. Without HOST_WEB_PORT in the
# shell or .env, Docker picks a free host port, so worktrees run side by side.
set -eu
cd "$(dirname "$0")/../.."

# A shell variable overrides .env, so set the free-port default only when .env has none.
if [ -z "${HOST_WEB_PORT+set}" ] && ! grep -Eqs '^[[:space:]]*(export[[:space:]]+)?HOST_WEB_PORT=' .env; then
  export HOST_WEB_PORT=0
fi

docker compose up --build --detach --wait
address=$(docker compose port broccoli 3000)
echo "Broccoli is running at http://localhost:${address##*:}"
echo "Stop it with: docker compose down"
