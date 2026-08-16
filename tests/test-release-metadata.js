'use strict';

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var ReleaseMetadata = require('../scripts/check-release-metadata');

assert.strictEqual(ReleaseMetadata.isSemanticVersion('1.0.6'), true, 'three-part semantic versions must be accepted');
assert.strictEqual(ReleaseMetadata.isSemanticVersion('01.0.6'), false, 'versions with leading zeroes must be rejected');
assert.strictEqual(ReleaseMetadata.isSemanticVersion('1.0'), false, 'incomplete versions must be rejected');
assert.strictEqual(ReleaseMetadata.isSemanticVersion('1.0.6-beta'), false, 'release metadata must use stable x.y.z versions');

assert.deepStrictEqual(
  ReleaseMetadata.validateVersions({ packageVersion: '1.0.6', lockVersion: '1.0.6', appVersion: '1.0.6' }),
  { version: '1.0.6', tag: '' },
  'matching project metadata must validate without a tag'
);
assert.deepStrictEqual(
  ReleaseMetadata.validateVersions({ packageVersion: '1.0.6', lockVersion: '1.0.6', appVersion: '1.0.6', tag: 'v1.0.6' }),
  { version: '1.0.6', tag: 'v1.0.6' },
  'a matching release tag must validate'
);
assert.throws(function () {
  ReleaseMetadata.validateVersions({ packageVersion: '1.0.7', lockVersion: '1.0.7', appVersion: '1.0.6' });
}, /package\.json version .* appinfo\.json version/, 'package and webOS versions must never drift');
assert.throws(function () {
  ReleaseMetadata.validateVersions({ packageVersion: '1.0.6', lockVersion: '1.0.5', appVersion: '1.0.6' });
}, /package-lock\.json version/, 'the root package-lock version must match package.json');
assert.throws(function () {
  ReleaseMetadata.validateVersions({ packageVersion: '1.0.6', lockVersion: '1.0.6', appVersion: '1.0.6', tag: 'v1.0.7' });
}, /release tag .* does not match/, 'release tags must match the coherent application version');
assert.throws(function () {
  ReleaseMetadata.validateVersions({ packageVersion: '1.0', lockVersion: '1.0', appVersion: '1.0' });
}, /semantic x\.y\.z/, 'invalid stable versions must be rejected before packaging');

var root = fs.mkdtempSync(path.join(os.tmpdir(), 'ploff-release-metadata-'));
fs.mkdirSync(path.join(root, 'webos-shell-app'));
fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'ploff-webos', version: '2.3.4' }));
fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ name: 'ploff-webos', version: '2.3.4', packages: { '': { name: 'ploff-webos', version: '2.3.4' } } }));
fs.writeFileSync(path.join(root, 'webos-shell-app', 'appinfo.json'), JSON.stringify({ id: 'io.github.rhapsodos.ploff', version: '2.3.4' }));
assert.deepStrictEqual(ReleaseMetadata.check(root, 'v2.3.4'), { version: '2.3.4', tag: 'v2.3.4' },
  'repository metadata validation must read the three version sources');
fs.rmSync(root, { recursive: true, force: true });

var projectRoot = path.resolve(__dirname, '..');
var packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
var releaseWorkflow = fs.readFileSync(path.join(projectRoot, '.github', 'workflows', 'release.yml'), 'utf8');
assert.strictEqual(packageJson.scripts['check:release-metadata'], 'node scripts/check-release-metadata.js',
  'npm verification must expose one canonical release metadata check');
assert.ok(/npm run check:release-metadata/.test(packageJson.scripts.verify),
  'the default verify gate must enforce release metadata consistency');
assert.ok(/node scripts\/check-release-metadata\.js "\$GITHUB_REF_NAME"/.test(releaseWorkflow),
  'tagged releases must reuse the canonical release metadata checker');
assert.ok(!/test "\$GITHUB_REF_NAME" = "v\$APP_VERSION"/.test(releaseWorkflow),
  'release workflow must not duplicate tag/version comparison logic in shell');

console.log('Release metadata checks passed');
