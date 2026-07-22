#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PORT=${1:-8098}
URL="http://127.0.0.1:$PORT/app/"

case "$PORT" in
  ''|*[!0-9]*)
    printf 'usage: %s [port]\n' "$0" >&2
    exit 2
    ;;
esac

command -v python3 >/dev/null 2>&1 || {
  printf 'python3 is required to run the local preview server.\n' >&2
  exit 1
}

printf 'Serving Ploff at %s\n' "$URL"
printf 'Press Ctrl+C to stop.\n'

if [ "${PLOFF_NO_OPEN:-0}" != "1" ]; then
  if command -v open >/dev/null 2>&1; then
    (sleep 0.5; open "$URL") &
  elif command -v xdg-open >/dev/null 2>&1; then
    (sleep 0.5; xdg-open "$URL") &
  fi
fi

exec python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT"
