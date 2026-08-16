'use strict';

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var Builder = require('../scripts/build-app');
var root = path.join(__dirname, '..');

function occurrences(value, fragment) {
  var count = 0;
  var offset = 0;
  var index;
  if (!fragment) { return 0; }
  while ((index = value.indexOf(fragment, offset)) !== -1) {
    count += 1;
    offset = index + fragment.length;
  }
  return count;
}

function assertUnique(files, label) {
  var seen = {};
  files.forEach(function (fileName) {
    assert.strictEqual(seen[fileName], undefined, label + ' must not list ' + fileName + ' twice');
    seen[fileName] = true;
  });
}

function assertOrderedFiles(bundleText, directory, files) {
  var previous = -1;
  files.forEach(function (fileName) {
    var content = Builder.compactSource(fs.readFileSync(path.join(root, 'app', directory, fileName), 'utf8'));
    var position = bundleText.indexOf(content);
    assert.notStrictEqual(position, -1, fileName + ' must appear in the generated bundle');
    assert.strictEqual(occurrences(bundleText, content), 1, fileName + ' must appear exactly once');
    assert.ok(position > previous, fileName + ' must preserve its declared bundle order');
    previous = position;
  });
  return previous;
}

assert.deepStrictEqual(Builder.MODULE_FILES, [
  'plex-feature-ports.js', 'presentation-services.js',
  'choice-dialog-controller.js', 'media-info-dialog-controller.js',
  'settings-controller.js', 'settings-feature-controller.js', 'diagnostics-controller.js', 'diagnostics-feature-controller.js', 'setup-feature-controller.js', 'server-controller.js', 'server-feature-controller.js',
  'search-controller.js', 'search-feature-controller.js', 'shell-controller.js', 'shell-feature-controller.js', 'library-controller.js', 'library-feature-controller.js', 'detail-controller.js', 'detail-feature-controller.js',
  'queue-sequence-contract.js', 'bounded-queue-cache.js', 'plex-container-queue-provider.js', 'series-queue-provider.js', 'queue-gap-controller.js',
  'playback-queue-controller.js', 'player-controls-controller.js', 'playback-controller.js', 'player-feature-controller.js', 'media-context-controller.js',
  'input-controller.js', 'pointer-controller.js', 'application-controller.js', 'application-bootstrap.js'
], 'coordinator modules must stay explicit and application-bootstrap.js must remain last');
assert.strictEqual(Object.prototype.hasOwnProperty.call(Builder, 'LEGACY_FILES'), false, 'the final builder must not expose legacy fragment inputs');
assertUnique(Builder.MODULE_FILES, 'MODULE_FILES');
assert.strictEqual(typeof Builder.compactSource, 'function', 'the builder must expose its deterministic bundle compaction');
assert.strictEqual(
  Builder.compactSource('  first  \n\n  \n    second\t \n'),
  'first\nsecond\n',
  'bundle compaction must remove blank lines and formatting-only indentation without changing executable lines'
);
assert.throws(function () {
  Builder.compactSource("var value = 'first" + "\\" + "\n  second';\n");
}, /line continuations/, 'bundle compaction must reject syntax whose string value depends on leading whitespace');

assert.strictEqual(
  Builder.bundle(['first\n', 'second\n']),
  'first\nsecond\n',
  'bundle concatenation must preserve source bytes without hidden separators'
);

var sourceBuilt = Builder.readSourceBundle(root);
var built = Builder.readBundle(root);
assertOrderedFiles(sourceBuilt, 'coordinator', Builder.MODULE_FILES);
assert.ok(built.length < sourceBuilt.length, 'the runtime bundle must be minified after deterministic source assembly');
assert.strictEqual(
  built,
  fs.readFileSync(path.join(root, 'app', 'app.js'), 'utf8'),
  'the checked-in browser bundle must match the canonical coordinator modules'
);
assert.strictEqual(fs.existsSync(path.join(root, 'app', 'source')), false, 'the final coordinator must not retain app/source');
assert.strictEqual(fs.existsSync(path.join(root, 'app', '.modular-coordinator')), true, 'the modular coordinator marker must be present');

var fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ploff-bundle-'));
fs.mkdirSync(path.join(fixtureRoot, 'app'));
fs.mkdirSync(path.join(fixtureRoot, 'app', 'coordinator'));
fs.writeFileSync(path.join(fixtureRoot, 'app', 'coordinator', 'alpha.js'), 'var alpha = 1;\n\n');
fs.writeFileSync(path.join(fixtureRoot, 'app', 'coordinator', 'beta.js'), 'var beta = 2;\n');
assert.strictEqual(
  Builder.readSourceBundle(fixtureRoot, ['alpha.js', 'beta.js']),
  'var alpha = 1;\nvar beta = 2;\n',
  'fixture source modules must follow declared order'
);
assert.strictEqual(
  Builder.readBundle(fixtureRoot, ['alpha.js', 'beta.js']),
  'var alpha=1;var beta=2;\n',
  'fixture modules must be minified after assembly'
);
assert.strictEqual(
  Builder.readBundle(fixtureRoot, ['beta.js', 'alpha.js']),
  'var beta=2;var alpha=1;\n',
  'swapping two module names must change minified output deterministically'
);
fs.rmSync(fixtureRoot, { recursive: true, force: true });

console.log('Application bundle checks passed');
