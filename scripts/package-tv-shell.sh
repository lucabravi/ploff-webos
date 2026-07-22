#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
ROOT=$(dirname "$SCRIPT_DIR")
STAGE=$(mktemp -d "${TMPDIR:-/tmp}/ploff-shell.XXXXXX")
SERVICE_STAGE=$(mktemp -d "${TMPDIR:-/tmp}/ploff-service.XXXXXX")
trap 'rm -rf "$STAGE" "$SERVICE_STAGE"' EXIT HUP INT TERM

node "$ROOT/scripts/build-app.js" --check
cp -R "$ROOT/app/." "$STAGE/"
rm -rf "$STAGE/source"
cp "$ROOT/webos-shell-app/appinfo.json" "$STAGE/appinfo.json"
cp "$ROOT/webos-shell-app/icon.png" "$STAGE/icon.png"
cp "$ROOT/webos-shell-app/largeIcon.png" "$STAGE/largeIcon.png"
cp -R "$ROOT/webos-service/." "$SERVICE_STAGE/"

APP_VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$ROOT/webos-shell-app/appinfo.json" | head -n 1)
test -n "$APP_VERSION" || { echo "unable to read the webOS application version" >&2; exit 1; }
printf '%s\n' "(function (root) { 'use strict'; root.PloffBuildInfo = { version: '$APP_VERSION' }; }(this));" > "$STAGE/build-info.js"

# A single application version keeps every staged script and stylesheet in sync.
sed "s/?v=[0-9A-Za-z._-]*/?v=$APP_VERSION/g" "$STAGE/index.html" > "$STAGE/index.html.versioned"
mv "$STAGE/index.html.versioned" "$STAGE/index.html"
node "$ROOT/scripts/check-shell-assets.js" "$STAGE/index.html" "$APP_VERSION"

CLI_VERSION=$(ares-package --version 2>/dev/null | head -n 1 || true)
{
  printf 'application=%s\n' "$APP_VERSION"
  printf 'webos-cli=%s\n' "${CLI_VERSION:-unknown}"
} > "$STAGE/build-manifest.txt"

# Local development overrides must never be embedded in distributable IPKs.
rm -f "$STAGE/config.local.js"

mkdir -p "$ROOT/dist"
ares-package -o "$ROOT/dist" "$STAGE" "$SERVICE_STAGE"
