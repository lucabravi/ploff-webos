#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
ROOT=$(dirname "$SCRIPT_DIR")

SIMULATOR_ROOT=${PLOFF_SIMULATOR_ROOT:-"$HOME/Library/Application Support/webOS TV SDK/Simulator"}
SIMULATOR_APPS=${PLOFF_SIMULATOR_APPS:-"$HOME/Library/Application Support/webOS TV SDK/SimulatorApps"}
SIMULATOR_APP=${PLOFF_SIMULATOR_APP:-}
SKIP_BUILD=${PLOFF_SIMULATOR_SKIP_BUILD:-0}
STAGE_ONLY=0

usage() {
    cat <<EOF
Usage: $0 [--stage-only] [--skip-build]

Build and launch the current Ploff app in the macOS webOS TV Simulator.

Environment overrides:
  PLOFF_SIMULATOR_ROOT       Simulator installation directory
  PLOFF_SIMULATOR_APPS       Simulator app import directory
  PLOFF_SIMULATOR_APP        Simulator .app bundle to open
  PLOFF_SIMULATOR_SKIP_BUILD Set to 1 to use already-generated assets
EOF
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --stage-only)
            STAGE_ONLY=1
            ;;
        --skip-build)
            SKIP_BUILD=1
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            echo "unknown option: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
    shift
done

command -v node >/dev/null 2>&1 || {
    echo "Node.js is required to build the simulator app." >&2
    exit 1
}

if [ "$SKIP_BUILD" != "1" ]; then
    node "$ROOT/scripts/build-styles.js"
    node "$ROOT/scripts/build-app.js"
fi

node "$ROOT/scripts/build-styles.js" --check
node "$ROOT/scripts/build-app.js" --check

APP_VERSION=$(node -e "var fs=require('fs');var file=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(String(file.version||''));" "$ROOT/webos-shell-app/appinfo.json")
if [ -z "$APP_VERSION" ]; then
    echo "unable to read the webOS application version" >&2
    exit 1
fi

TARGET="$SIMULATOR_APPS/ploff-webos-$APP_VERSION"
rm -rf "$TARGET"
mkdir -p "$TARGET" "$SIMULATOR_APPS"
cp -R "$ROOT/app/." "$TARGET/"
rm -rf "$TARGET/source"
cp "$ROOT/webos-shell-app/appinfo.json" "$TARGET/appinfo.json"
cp "$ROOT/webos-shell-app/icon.png" "$TARGET/icon.png"
cp "$ROOT/webos-shell-app/largeIcon.png" "$TARGET/largeIcon.png"
cp "$ROOT/webos-shell-app/splashBackground.png" "$TARGET/splashBackground.png"
printf '%s\n' "(function (root) { 'use strict'; root.PloffBuildInfo = { version: '$APP_VERSION' }; }(this));" > "$TARGET/build-info.js"

ASSET_HASH=$(node "$ROOT/scripts/asset-cache-key.js" "$TARGET")
CACHE_KEY="$APP_VERSION-$ASSET_HASH"
sed "s/?v=[0-9A-Za-z._-]*/?v=$CACHE_KEY/g" "$TARGET/index.html" > "$TARGET/index.html.versioned"
mv "$TARGET/index.html.versioned" "$TARGET/index.html"
node "$ROOT/scripts/check-shell-assets.js" "$TARGET/index.html" "$CACHE_KEY"
rm -f "$TARGET/config.local.js"

echo "Staged Ploff $APP_VERSION at:"
echo "  $TARGET"

if [ "$STAGE_ONLY" = "1" ]; then
    exit 0
fi

if [ -z "$SIMULATOR_APP" ]; then
    SIMULATOR_APP=$(find "$SIMULATOR_ROOT" -type d -name '*.app' -print 2>/dev/null | sort | tail -n 1 || true)
fi

if [ -z "$SIMULATOR_APP" ] || [ ! -d "$SIMULATOR_APP" ]; then
    echo "webOS Simulator .app not found under: $SIMULATOR_ROOT" >&2
    echo "Set PLOFF_SIMULATOR_APP to its .app path." >&2
    exit 1
fi

command -v open >/dev/null 2>&1 || {
    echo "macOS 'open' is required to launch the simulator." >&2
    exit 1
}
command -v osascript >/dev/null 2>&1 || {
    echo "macOS 'osascript' is required to automate the simulator import dialog." >&2
    exit 1
}
command -v swift >/dev/null 2>&1 || {
    echo "Swift is required to click the virtual simulator remote." >&2
    exit 1
}

SIMULATOR_PROCESS=$(basename "$SIMULATOR_APP" .app)
open "$SIMULATOR_APP"

READY=0
for _attempt in $(seq 1 60); do
    if pgrep -f "$SIMULATOR_PROCESS" >/dev/null 2>&1; then
        READY=1
        break
    fi
    sleep 0.5
done

if [ "$READY" != "1" ]; then
    echo "simulator did not start: $SIMULATOR_PROCESS" >&2
    exit 1
fi

/usr/bin/osascript - "$SIMULATOR_PROCESS" <<'APPLESCRIPT'
on run argv
    tell application "System Events"
        set frontmost of process (item 1 of argv) to true
    end tell
end run
APPLESCRIPT

# The App button is part of the simulator's virtual RCU. Ratios keep this
# independent of the simulator window position and the host display scale.
swift "$SCRIPT_DIR/simulator-rcu-click.swift" 0.25 0.85
sleep 0.8

/usr/bin/osascript - "$TARGET" <<'APPLESCRIPT'
on run argv
    set targetPath to item 1 of argv
    tell application "System Events"
        keystroke "g" using {command down, shift down}
        delay 0.35
        keystroke targetPath
        key code 36
        delay 0.5
        key code 36
    end tell
end run
APPLESCRIPT

echo "Imported Ploff $APP_VERSION into the webOS TV Simulator."
