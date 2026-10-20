#!/bin/sh
# Starts this checkout's development stack on a free host port unless HOST_WEB_PORT is set,
# prints its URL and follows new logs. Successful startup is quiet; failures print their output.
# Any exit removes the containers; the database volume stays
# unless --drop-db removes it before the start.
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

quiet() {
  output=$("$@" 2>&1) || {
    status=$?
    printf '%s\n' "$output" >&2
    return "$status"
  }
}

case "${1:-}" in
  '') ;;
  --drop-db)
    # Only this checkout's database volume: `down --volumes` would also take other profiles'
    # volumes, or another checkout's when project names collide.
    database=$(docker volume ls --quiet --filter "label=org.getbroccoli.checkout=$PWD" \
      --filter label=com.docker.compose.volume=dev-postgres-data)
    quiet compose down
    if [ -n "$database" ]; then quiet docker volume rm $database; fi
    ;;
  *)
    echo "Usage: pnpm dev [--drop-db]" >&2
    exit 2
    ;;
esac

# The containers run on the checkout's node_modules.
quiet pnpm install --frozen-lockfile

trap 'quiet compose down' EXIT
# Ctrl-C is the normal way to stop. sh skips the EXIT trap when a signal kills it, so turn
# signals into an exit; HUP comes from a closed terminal.
trap 'exit 0' HUP INT TERM

quiet compose up --detach --wait
address=$(compose port web 5173)
green='' cyan='' reset=''
if [ -t 1 ]; then
  green='\033[1;32m'
  cyan='\033[1;36m'
  reset='\033[0m'
fi
printf '\n%b🥦🥦🥦  Broccoli is ready!%b  ➜  %bhttp://localhost:%s%b\n\n' \
  "$green" "$reset" "$cyan" "${address##*:}" "$reset"
compose logs --follow --tail 0
