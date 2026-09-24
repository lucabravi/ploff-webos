#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PORT=${1:-8098}
URL="http://127.0.0.1:$PORT/app/"
PREVIEW_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/ploff-preview.XXXXXX")
trap 'rm -rf "$PREVIEW_ROOT"' EXIT HUP INT TERM

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

mkdir -p "$PREVIEW_ROOT/app"
cp -R "$ROOT/app/." "$PREVIEW_ROOT/app/"
cp "$ROOT/scripts/preview-dev-auth.js" "$PREVIEW_ROOT/app/preview-dev-auth.js"
awk '
  {
    print
    if ($0 ~ /<script src="credential-vault\.js\?v=dev"><\/script>/) {
      print "  <script src=\"preview-dev-auth.js?v=dev\"></script>"
    }
  }
' "$ROOT/app/index.html" > "$PREVIEW_ROOT/app/index.html.preview"
mv "$PREVIEW_ROOT/app/index.html.preview" "$PREVIEW_ROOT/app/index.html"

printf 'Serving Ploff at %s\n' "$URL"
printf 'Press Ctrl+C to stop.\n'

if [ "${PLOFF_NO_OPEN:-0}" != "1" ]; then
  if command -v open >/dev/null 2>&1; then
    (sleep 0.5; open "$URL") &
  elif command -v xdg-open >/dev/null 2>&1; then
    (sleep 0.5; xdg-open "$URL") &
  fi
fi

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$PREVIEW_ROOT"
