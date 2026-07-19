#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

for path in \
  LICENSE \
  README.md \
  .github/workflows/ci.yml \
  .github/workflows/release.yml \
  docs/architecture.md \
  docs/playback-invariants.md \
  docs/testing.md \
  shell/build-info.js \
  shell/config.js \
  shell/i18n.js \
  shell/locales/en.js \
  shell/locales/it.js \
  shell/locales/es.js \
  shell/locales/fr.js \
  shell/locales/de.js \
  shell/locales/pt.js \
  shell/media-labels.js \
  shell/plex-link-qr.png \
  webos-shell-app/appinfo.json \
  webos-shell-app/icon.png \
  webos-shell-app/largeIcon.png \
  scripts/package-tv-shell.sh \
  scripts/inspect-ipk.sh \
  scripts/check-shell-assets.js \
  scripts/install-webos.sh; do
  test -f "$path" || { echo "missing: $path" >&2; exit 1; }
done

test ! -f shell/config.local.js || git check-ignore -q shell/config.local.js
test ! -d docs/superpowers
test ! -f docs/advanced-subtitles-navigation-diagnostics-design.md
test ! -d webos-app
test ! -d npm
test ! -f scripts/build-legacy-web.sh
test ! -f scripts/package-webos.sh
! find . \
  -path './.git' -prune -o \
  -path './.worktrees' -prune -o \
  -path './dist' -prune -o \
  -type f -name '*.ipk' -print -quit | grep -q .
! grep -RE 'PlexOnlineToken="[A-Za-z0-9_-]{10,}' . \
  --exclude-dir=.git --exclude-dir=.worktrees --exclude-dir=dist
! grep -RE 'X-Plex-Token=[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{20,}' \
  shell webos-service webos-shell-app scripts docs README.md .github
! grep -RE '(apiBaseUrl|token)[[:space:]]*:[[:space:]]*["'"'][^"'"']+["'"']' shell/config.js
sh -n scripts/package-tv-shell.sh scripts/install-webos.sh scripts/inspect-ipk.sh
node scripts/check-shell-assets.js shell/index.html dev
node --check webos-service/service.js
node --check webos-service/gdm-parser.js

test -f README.md
grep -q 'MIT' README.md
grep -qi 'unofficial' README.md
grep -q 'for test in tests/test-\*.js' README.md
grep -q 'package-tv-shell.sh' README.md
grep -q 'install-webos.sh' README.md
grep -qi 'chapter' README.md
grep -qi 'chapter' docs/playback-invariants.md
grep -q 'rm -f "$STAGE/config.local.js"' scripts/package-tv-shell.sh
grep -q 'PloffBuildInfo' scripts/package-tv-shell.sh
grep -q 'io.github.rhapsodos.ploff' webos-shell-app/appinfo.json
grep -q 's/?v=' scripts/package-tv-shell.sh
grep -q 'APP_VERSION=' scripts/package-tv-shell.sh
! grep -q 'cp .*config.local.js.*config.js' scripts/package-tv-shell.sh
grep -q 'webos-shell-app/icon.png' scripts/package-tv-shell.sh
! grep -q 'living-room-tv' scripts/install-webos.sh
package_line=$(grep -n '"$SCRIPT_DIR/package-tv-shell.sh"' scripts/install-webos.sh | head -n 1 | cut -d: -f1)
selection_line=$(grep -n 'PACKAGE=$(find' scripts/install-webos.sh | head -n 1 | cut -d: -f1)
test -n "$package_line" && test -n "$selection_line" && test "$package_line" -lt "$selection_line"
grep -q "tags:.*v\*" .github/workflows/release.yml
grep -q 'gh release create' .github/workflows/release.yml
grep -q 'SHA256SUMS' .github/workflows/release.yml
grep -q 'cd dist && sha256sum' .github/workflows/release.yml
grep -q '@webos-tools/cli@3.2.5' .github/workflows/release.yml
grep -q 'gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e' .github/workflows/ci.yml
grep -q 'Prebuilt Releases' README.md

echo "baseline checks passed"
