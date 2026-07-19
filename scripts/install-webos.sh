#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
ROOT=$(dirname "$SCRIPT_DIR")

WEBOS_DEVICE=${1:-${WEBOS_DEVICE:-}}
APP_ID=$(sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$ROOT/webos-shell-app/appinfo.json" | head -n 1)

if [ -z "$WEBOS_DEVICE" ]; then
  echo "usage: $0 <webos-device> (or set WEBOS_DEVICE)" >&2
  exit 1
fi

if [ -z "$APP_ID" ]; then
  echo "unable to read the webOS application id" >&2
  exit 1
fi

"$SCRIPT_DIR/package-tv-shell.sh"
PACKAGE=$(find "$ROOT/dist" -maxdepth 1 -name "${APP_ID}_*_all.ipk" -print | sort -V | tail -n 1)

if [ -z "$PACKAGE" ]; then
  echo "unable to find the packaged webOS application" >&2
  exit 1
fi

ares-install --device "$WEBOS_DEVICE" "$PACKAGE"
ares-launch --device "$WEBOS_DEVICE" "$APP_ID"
