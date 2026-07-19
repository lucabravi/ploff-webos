#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
ROOT=$(dirname "$SCRIPT_DIR")
APP_ID=$(sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$ROOT/webos-shell-app/appinfo.json" | head -n 1)
APP_VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$ROOT/webos-shell-app/appinfo.json" | head -n 1)
PACKAGE=${1:-"$ROOT/dist/${APP_ID}_${APP_VERSION}_all.ipk"}
STAGE=$(mktemp -d "${TMPDIR:-/tmp}/ploff-ipk-audit.XXXXXX")
trap 'rm -rf "$STAGE"' EXIT HUP INT TERM

test -f "$PACKAGE" || { echo "package not found: $PACKAGE" >&2; exit 1; }
ar -p "$PACKAGE" data.tar.gz | tar -xzf - -C "$STAGE"

APP_ROOT="$STAGE/usr/palm/applications/$APP_ID"
test -d "$APP_ROOT" || { echo "application payload missing" >&2; exit 1; }
test -f "$APP_ROOT/build-manifest.txt" || { echo "build manifest missing" >&2; exit 1; }
node "$ROOT/scripts/check-shell-assets.js" "$APP_ROOT/index.html" "$APP_VERSION"

if find "$STAGE" -type f \( -name 'config.local.js' -o -name '.env' -o -name '*.ipk' \) -print -quit | grep -q .; then
  echo "development or local configuration found in package" >&2
  exit 1
fi
if find "$APP_ROOT" -type d \( -name tests -o -name docs -o -name .git \) -print -quit | grep -q .; then
  echo "development directories found in package" >&2
  exit 1
fi
if grep -RIE 'PlexOnlineToken="[A-Za-z0-9_-]{10,}|X-Plex-Token=[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}' "$STAGE" >/dev/null 2>&1; then
  echo "credential-like content found in package" >&2
  exit 1
fi

echo "IPK inspection passed: $PACKAGE"
