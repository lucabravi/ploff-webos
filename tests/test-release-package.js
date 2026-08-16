'use strict';

var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var ReleasePackage = require('../scripts/release-package');

function fixtureRoot() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'ploff-release-package-'));
  fs.mkdirSync(path.join(root, 'webos-shell-app'), { recursive: true });
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'ploff-webos', version: '2.3.4' }));
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ name: 'ploff-webos', version: '2.3.4', packages: { '': { name: 'ploff-webos', version: '2.3.4' } } }));
  fs.writeFileSync(path.join(root, 'webos-shell-app', 'appinfo.json'), JSON.stringify({ id: 'io.github.rhapsodos.ploff', version: '2.3.4' }));
  return root;
}

(function dryRunPlanIsDeterministicAndSideEffectFree() {
  var root = fixtureRoot();
  var plan = ReleasePackage.plan(root);
  assert.deepStrictEqual(plan.steps.map(function (step) { return step.label; }), [
    'build styles', 'build app bundle', 'pre-release verification', 'package webOS shell', 'inspect IPK'
  ], 'release packaging must compose generated builds, verification, packaging and inspection in a stable order');
  assert.strictEqual(plan.version, '2.3.4');
  assert.strictEqual(plan.artifact, path.join(root, 'dist', 'io.github.rhapsodos.ploff_2.3.4_all.ipk'));
  assert.strictEqual(plan.checksumFile, path.join(root, 'dist', 'SHA256SUMS'));
  assert.strictEqual(fs.existsSync(plan.checksumFile), false, 'planning a release must not write any files');
  fs.rmSync(root, { recursive: true, force: true });
}());

(function executionWritesPortableSha256SumsAfterSuccessfulPackaging() {
  var root = fixtureRoot();
  var calls = [];
  var result = ReleasePackage.run(root, {
    runner: function (step) {
      calls.push(step.label);
      if (step.label === 'package webOS shell') {
        var artifact = path.join(root, 'dist', 'io.github.rhapsodos.ploff_2.3.4_all.ipk');
        fs.writeFileSync(artifact, 'test-ipk');
      }
      return { status: 0 };
    }
  });
  var expectedHash = crypto.createHash('sha256').update('test-ipk').digest('hex');
  assert.deepStrictEqual(calls, ['build styles', 'build app bundle', 'pre-release verification', 'package webOS shell', 'inspect IPK']);
  assert.strictEqual(result.sha256, expectedHash);
  assert.strictEqual(fs.readFileSync(result.checksumFile, 'utf8'), expectedHash + '  io.github.rhapsodos.ploff_2.3.4_all.ipk\n', 'checksum output must remain compatible with sha256sum --check');
  fs.rmSync(root, { recursive: true, force: true });
}());

(function commandFailureStopsTheReleaseBeforeChecksumCreation() {
  var root = fixtureRoot();
  assert.throws(function () {
    ReleasePackage.run(root, {
      runner: function (step) {
        return { status: step.label === 'pre-release verification' ? 7 : 0 };
      }
    });
  }, /pre-release verification failed with exit code 7/, 'release packaging must fail immediately when a composed gate fails');
  assert.strictEqual(fs.existsSync(path.join(root, 'dist', 'SHA256SUMS')), false);
  fs.rmSync(root, { recursive: true, force: true });
}());

console.log('Release package orchestration checks passed');
