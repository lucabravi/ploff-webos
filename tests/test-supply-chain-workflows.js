'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var ci = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
var release = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
var dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
var actionRefPattern = /^\s*-?\s*uses:\s*[^\s@]+@[a-f0-9]{40}(?:\s+#.*)?$/gm;
var usesLines = (ci + '\n' + release).split('\n').filter(function (line) {
  return /^\s*-?\s*uses:\s*/.test(line);
});

(function allExternalActionsArePinnedToCommitShas() {
  var pinned = (ci + '\n' + release).match(actionRefPattern) || [];
  assert.strictEqual(pinned.length, usesLines.length,
    'every external GitHub Action reference must use an immutable 40-character commit SHA');
}());

(function buildJobsUseTheRegisteredPrivateRunner() {
  var runner = 'runs-on: [self-hosted, Linux, X64, plex-local-build]';
  assert.ok(ci.indexOf(runner) !== -1,
    'the CI workflow must use the registered private build runner');
  assert.ok(/^ {2}verify:\n[\s\S]*?^ {4}runs-on: \[self-hosted, Linux, X64, plex-local-build\]$/m.test(release),
    'the release verification job must use the registered private build runner');
  assert.ok(/^ {2}package-ipk:\n[\s\S]*?^ {4}runs-on: \[self-hosted, Linux, X64, plex-local-build\]$/m.test(release),
    'the IPK packaging job must use the registered private build runner');
  assert.ok(/^ {2}publish-image:\n[\s\S]*?^ {4}runs-on: \[self-hosted, Linux, X64, plex-local-build\]$/m.test(release),
    'the container publishing job must use the registered private build runner');
  assert.ok(!/runs-on:\s*ubuntu-latest/.test(ci + '\n' + release),
    'the private build workflows must not silently fall back to GitHub-hosted runners');
}());

(function releaseVerificationRunsThePreReleaseMemoryGate() {
  assert.ok(/^ {8}run: npm run test:pre-release$/m.test(release),
    'tagged releases must run the full verification suite and the pre-release memory gate');
}());

(function ipkReleasePublishesAndAttestsAnSbomOfPackagedContents() {
  assert.ok(/package-ipk:[\s\S]*permissions:[\s\S]*attestations:\s*write[\s\S]*id-token:\s*write/.test(release),
    'the IPK release job must have the permissions required for GitHub artifact attestations');
  assert.ok(/anchore\/sbom-action@e22c389904149dbc22b58101806040fa8d37a610\s+#\s+v0\.24\.0/.test(release),
    'the IPK release must generate its SBOM with the pinned Anchore action');
  assert.ok(/ar -p "\$PACKAGE" data\.tar\.gz \| tar -xzf - -C "\$SBOM_ROOT"/.test(release),
    'the SBOM source must be the extracted IPK payload rather than the development repository');
  assert.ok(/output-file:\s*dist\/SBOM\.spdx\.json/.test(release),
    'the release must materialize a JSON SPDX SBOM as a distributable asset');
  assert.ok(/actions\/attest@1e69f48acb82d1966a394da916b4c1698aa569d6\s+#\s+v4\.2\.2[\s\S]*subject-path:\s*\$\{\{ env\.PACKAGE \}\}/.test(release),
    'the built IPK must receive a pinned GitHub provenance attestation');
  assert.ok(/sbom-path:\s*dist\/SBOM\.spdx\.json/.test(release),
    'the generated SBOM must be attested against the IPK subject');
  assert.ok(/gh release (?:upload|create)[\s\S]*SBOM\.spdx\.json/.test(release),
    'the SPDX SBOM must be published with the GitHub Release assets');
}());

(function publishedContainerUsesDigestBasedGithubAttestation() {
  assert.ok(/publish-image:[\s\S]*permissions:[\s\S]*attestations:\s*write[\s\S]*id-token:\s*write/.test(release),
    'the image publish job must have attestation and OIDC permissions');
  assert.ok(/id:\s*build[\s\S]*uses:\s*docker\/build-push-action@/.test(release),
    'the image build step must expose its pushed digest under a stable build step id');
  assert.ok(/subject-name:\s*ghcr\.io\/\$\{\{ github\.repository_owner \}\}\/ploff-webos-installer/.test(release),
    'container provenance must name the repository image without a mutable tag');
  assert.ok(/subject-digest:\s*\$\{\{ steps\.build\.outputs\.digest \}\}/.test(release),
    'container provenance must bind to the exact digest returned by build-push-action');
  assert.ok(/push-to-registry:\s*true/.test(release),
    'container provenance must be pushed alongside the registry image');
}());

(function containerInputsAreImmutable() {
  assert.ok(/^FROM node:20-bookworm-slim@sha256:[a-f0-9]{64}$/m.test(dockerfile),
    'the installer image base must retain the readable Node tag and pin its immutable manifest digest');
  assert.ok(/ghcr\.io\/gitleaks\/gitleaks:v8\.24\.3@sha256:[a-f0-9]{64}/.test(ci),
    'the pull-request Gitleaks container must use the upstream GHCR image pinned by digest');
}());

console.log('Supply-chain workflow checks passed');
