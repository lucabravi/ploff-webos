#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
ROOT=$(dirname "$SCRIPT_DIR")
DEVICE=${PLOFF_DEVICE:-ploff-tv}
TV_IP=${PLOFF_TV_IP:-}
TV_PASSPHRASE=${PLOFF_TV_PASSPHRASE:-}
APP_ID=$(sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$ROOT/webos-shell-app/appinfo.json" | head -n 1)

usage() {
  cat <<'EOF'
Ploff webOS installer

Usage:
  docker ... install   Pair when needed, then build, install, and launch Ploff
  docker ... pair      Configure the TV and retrieve its Developer Mode key
  docker ... package   Build and inspect the generic IPK

The TV must have Developer Mode and Key Server enabled.
Configuration and keys are retained in the mounted /data volume.
EOF
}

prompt_value() {
  label=$1
  value=$2
  if [ -n "$value" ]; then
    printf '%s' "$value"
    return
  fi
  if [ ! -t 0 ]; then
    echo "$label is required in a non-interactive container" >&2
    exit 1
  fi
  printf '%s: ' "$label" >&2
  IFS= read -r value
  printf '%s' "$value"
}

prompt_secret() {
  value=$1
  if [ -n "$value" ]; then
    printf '%s' "$value"
    return
  fi
  if [ ! -t 0 ]; then
    echo "PLOFF_TV_PASSPHRASE is required in a non-interactive container" >&2
    exit 1
  fi
  printf 'Developer Mode passphrase: ' >&2
  stty -echo
  IFS= read -r value
  stty echo
  printf '\n' >&2
  printf '%s' "$value"
}

device_exists() {
  ares-setup-device --listfull 2>/dev/null | grep -q "\"name\": \"$DEVICE\""
}

key_exists() {
  test -s "$HOME/.ssh/${DEVICE}_webos"
}

connection_works() {
  ares-device --system-info --device "$DEVICE" >/dev/null 2>&1
}

pair_tv() {
  TV_IP=$(prompt_value "TV IP address" "$TV_IP")
  TV_PASSPHRASE=$(prompt_secret "$TV_PASSPHRASE")
  mkdir -p "$HOME/.ssh" "$HOME/.webos/tv"
  if device_exists; then
    ares-setup-device --modify "$DEVICE" \
      --info "host=$TV_IP" --info "port=9922" --info "username=prisoner" >/dev/null
  else
    ares-setup-device --add "$DEVICE" \
      --info "host=$TV_IP" --info "port=9922" --info "username=prisoner" >/dev/null
  fi
  echo "Retrieving the Developer Mode key..."
  ares-novacom --getkey --device "$DEVICE" --passphrase "$TV_PASSPHRASE"
  echo "TV paired as $DEVICE."
}

package_app() {
  "$SCRIPT_DIR/package-tv-shell.sh"
  "$SCRIPT_DIR/inspect-ipk.sh"
}

install_app() {
  if ! device_exists || ! key_exists || ! connection_works; then
    pair_tv
  fi
  package_app
  PACKAGE=$(find "$ROOT/dist" -maxdepth 1 -name "${APP_ID}_*_all.ipk" -print | sort -V | tail -n 1)
  test -n "$PACKAGE" || { echo "Ploff package was not created" >&2; exit 1; }
  ares-install --device "$DEVICE" "$PACKAGE"
  ares-launch --device "$DEVICE" "$APP_ID"
  echo "Ploff is installed and running."
}

case ${1:-install} in
  install|update) install_app ;;
  pair) pair_tv ;;
  package) package_app ;;
  help|-h|--help) usage ;;
  *) usage >&2; exit 1 ;;
esac
