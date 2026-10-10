#!/bin/sh
# Starts this checkout's development stack on a free host port unless HOST_WEB_PORT is set,
# prints its URL and follows the logs. Any exit removes the containers; the database volume stays.
set -eu
cd "$(dirname "$0")/../.."

HOST_UID=$(id -u)
HOST_GID=$(id -g)
# prune.mjs removes this stack once the checkout is gone.
BROCCOLI_CHECKOUT=$PWD
export HOST_UID HOST_GID BROCCOLI_CHECKOUT

compose() {
  docker compose -f docker-compose.yml -f packages/scripts/docker-compose.dev.yml "$@"
}

# The containers run on the checkout's node_modules.
pnpm install --frozen-lockfile

trap 'compose down' EXIT
# Ctrl-C is the normal way to stop. sh skips the EXIT trap when a signal kills it, so turn
# signals into an exit; HUP comes from a closed terminal.
trap 'exit 0' HUP INT TERM

compose up --detach --wait
address=$(compose port web 5173)
echo "Broccoli dev is running at http://localhost:${address##*:}"
compose logs --follow
