#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

for path in \
  LICENSE \
  README.md \
  package.json \
  package-lock.json \
  eslint.config.js \
  jsconfig.json \
  Dockerfile \
  .dockerignore \
  .github/workflows/ci.yml \
  .github/workflows/release.yml \
  docs/architecture.md \
  docs/application-source-architecture.md \
  docs/playback-invariants.md \
  docs/testing.md \
  docs/themes.md \
  docs/settings.md \
  docs/diagnostics.md \
  app/build-info.js \
  app/config.js \
  app/i18n.js \
  app/settings-schema.js \
  app/locales/en.js \
  app/locales/it.js \
  app/locales/es.js \
  app/locales/fr.js \
  app/locales/de.js \
  app/locales/pt.js \
  app/locales/ja.js \
  app/locales/ko.js \
  app/local-data.js \
  app/credential-vault.js \
  app/media-labels.js \
  app/ploff-logo.svg \
  app/plex-link-qr.png \
  webos-shell-app/appinfo.json \
  webos-shell-app/logo.svg \
  webos-shell-app/icon.png \
  webos-shell-app/largeIcon.png \
  webos-shell-app/splashBackground.png \
  scripts/package-tv-shell.sh \
  scripts/inspect-ipk.sh \
  scripts/check-shell-assets.js \
  scripts/check-lg-ux.js \
  scripts/build-app.js \
  scripts/check-release-signoff.js \
  scripts/check-release-metadata.js \
  scripts/preview-local.sh \
  scripts/docker-installer.sh \
  scripts/install-webos.sh \
  tests/test-application-session.js \
  tests/test-controller-contracts.js; do
  test -f "$path" || { echo "missing: $path" >&2; exit 1; }
done

node - <<'NODE'
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var Builder = require('./scripts/build-app');

function listedFiles(directory, files) {
  var root = path.join('app', directory);
  var actual = fs.existsSync(root) ? fs.readdirSync(root).filter(function (name) {
    return /\.js$/.test(name);
  }).sort() : [];
  var declared = files.slice().sort();
  assert.deepStrictEqual(actual, declared, directory + ' JavaScript files must match the build list');
  files.forEach(function (name) {
    assert.ok(fs.existsSync(path.join(root, name)), 'missing: ' + path.join(root, name));
  });
}

assert.strictEqual(new Set(Builder.MODULE_FILES).size, Builder.MODULE_FILES.length, 'MODULE_FILES must be unique');
assert.strictEqual(Object.prototype.hasOwnProperty.call(Builder, 'LEGACY_FILES'), false, 'final builder must not expose LEGACY_FILES');
listedFiles('coordinator', Builder.MODULE_FILES);
assert.strictEqual(fs.existsSync(path.join('app', 'source')), false, 'final coordinator must remove app/source');
NODE

if test -f app/.modular-coordinator; then
  if test -d app/source && find app/source -type f -name '*.js' -print -quit | grep -q .; then
    echo "modular coordinator marker forbids app/source JavaScript" >&2
    exit 1
  fi
  if grep -q 'Generated bundle entry' app/app.js; then
    echo "modular coordinator bundle still contains the legacy entry marker" >&2
    exit 1
  fi
else
  grep -q 'Generated bundle entry' app/app.js
fi

test ! -f app/config.local.js || git check-ignore -q app/config.local.js
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
  app webos-service webos-shell-app scripts docs README.md .github
! grep -RE '(apiBaseUrl|token)[[:space:]]*:[[:space:]]*["'"'][^"'"']+["'"']' app/config.js
sh -n scripts/package-tv-shell.sh scripts/docker-installer.sh scripts/install-webos.sh scripts/inspect-ipk.sh
node scripts/check-shell-assets.js app/index.html dev
node scripts/build-app.js --check
node --check webos-service/service.js
node --check webos-service/gdm-parser.js

test -f README.md
grep -q 'MIT' README.md
grep -qi 'unofficial' README.md
grep -q 'npm run verify' README.md
grep -q 'npm run build:app' README.md
grep -q 'npm run verify' .github/workflows/ci.yml
grep -q 'npm run verify' .github/workflows/release.yml
grep -q 'npm run check:deps' .github/workflows/ci.yml
grep -q 'npm run check:deps' .github/workflows/release.yml
grep -q 'check-release-signoff.js.*GITHUB_REF_NAME' .github/workflows/release.yml
grep -q '"check:deps": "npm audit --audit-level=high"' package.json
grep -q 'Physical-TV Release Signoff' docs/testing.md
test -f docs/store-submission/lg-ux-compliance.md
grep -q '"check:coordinator": "for file in app/coordinator/\*.js' package.json
grep -q '"check:lg-ux": "node scripts/check-lg-ux.js"' package.json
grep -q 'npm run check:lg-ux' docs/store-submission/lg-ux-compliance.md
test -f docs/release-signoff/TEMPLATE.md
grep -q 'package-tv-shell.sh' README.md
grep -q 'install-webos.sh' README.md
grep -qi 'chapter' README.md
grep -qi 'chapter' docs/playback-invariants.md
grep -q 'rm -f "$STAGE/config.local.js"' scripts/package-tv-shell.sh
grep -q 'PloffBuildInfo' scripts/package-tv-shell.sh
grep -q 'build-app.js.*--check' scripts/package-tv-shell.sh
grep -q 'rm -rf "$STAGE/source"' scripts/package-tv-shell.sh
grep -q 'io.github.rhapsodos.ploff' webos-shell-app/appinfo.json
grep -q 'webos-shell-app/logo.svg' README.md
grep -q '<title id="title">Ploff</title>' app/ploff-logo.svg
! grep -q '<rect' app/ploff-logo.svg
grep -q 's/?v=' scripts/package-tv-shell.sh
grep -q 'APP_VERSION=' scripts/package-tv-shell.sh
! grep -q 'cp .*config.local.js.*config.js' scripts/package-tv-shell.sh
grep -q 'webos-shell-app/icon.png' scripts/package-tv-shell.sh
grep -q 'webos-shell-app/splashBackground.png' scripts/package-tv-shell.sh
grep -q 'ares-device --system-info' scripts/docker-installer.sh
! grep -q 'living-room-tv' scripts/install-webos.sh
package_line=$(grep -n '"$SCRIPT_DIR/package-tv-shell.sh"' scripts/install-webos.sh | head -n 1 | cut -d: -f1)
selection_line=$(grep -n 'PACKAGE=$(find' scripts/install-webos.sh | head -n 1 | cut -d: -f1)
test -n "$package_line" && test -n "$selection_line" && test "$package_line" -lt "$selection_line"
grep -q "tags:.*v\*" .github/workflows/release.yml
grep -q '^  verify:' .github/workflows/release.yml
grep -q '^  package-ipk:' .github/workflows/release.yml
grep -q '^  publish-image:' .github/workflows/release.yml
test "$(grep -c 'needs: verify' .github/workflows/release.yml)" -eq 2
grep -q 'gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e' .github/workflows/release.yml
grep -q 'gh release create' .github/workflows/release.yml
grep -q 'SHA256SUMS' .github/workflows/release.yml
grep -q 'cd dist && sha256sum' .github/workflows/release.yml
grep -q '@webos-tools/cli@3.2.5' .github/workflows/release.yml
grep -q 'gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e' .github/workflows/ci.yml
grep -q "branches:.*\*\*" .github/workflows/ci.yml
grep -q '^## Installation$' README.md
grep -q '^### Docker (recommended)$' README.md
grep -q '<summary><strong>Manual installation</strong></summary>' README.md
grep -q 'ghcr.io/lucabravi/ploff-webos-installer:latest' README.md
grep -q '@webos-tools/cli@3.2.5' Dockerfile
grep -q 'platforms: linux/amd64,linux/arm64' .github/workflows/release.yml
grep -q 'VOLUME.*"/data"' Dockerfile
! grep -Eq 'PLOFF_TV_(IP|PASSPHRASE)=' Dockerfile
grep -q "trap 'stty echo 2>/dev/null || true' 0" scripts/docker-installer.sh

echo "baseline checks passed"
