'use strict';
var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var childProcess = require('child_process');
var Builder = require('../scripts/build-app');
var Contracts = require('../scripts/check-feature-contracts');
var Maintainability = require('../scripts/check-maintainability');
var RuntimeEs5 = require('../scripts/check-runtime-es5');
var root = path.join(__dirname, '..');
var temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ploff-generated-player-'));
function write(relative, contents) {
  var name = path.join(temp, relative);
  fs.mkdirSync(path.dirname(name), { recursive: true });
  fs.writeFileSync(name, contents);
}
try {
  var files = Builder.PRELUDE_FILES.concat(Builder.MODULE_FILES.map(function (name) { return 'coordinator/' + name; }), Builder.PLAYER_FILES);
  files.forEach(function (file, index) { write('app/' + file, 'var module' + index + ' = ' + index + ';\n'); });
  Builder.write(temp);
  assert.strictEqual(Builder.check(temp), true);
  write('app/' + Builder.PLAYER_FILES[0], 'var changedPlayer = true;\n');
  assert.strictEqual(Builder.check(temp), false, 'a Player-only source edit must fail the same freshness gate');
  Builder.write(temp);
  write('app/player.js', 'var stalePlayer = true;\n');
  assert.strictEqual(Builder.check(temp), false, 'a stale generated Player file must fail');
  Builder.write(temp);
  fs.unlinkSync(path.join(temp, 'app/player.js'));
  assert.strictEqual(Builder.check(temp), false, 'a missing generated Player file must fail');
  Builder.write(temp);
  write('app/app.js', 'var staleCore = true;\n');
  assert.strictEqual(Builder.check(temp), false, 'Core freshness remains independent');

  // Source-only checkers must ignore generated code, but never authored owners.
  Contracts.FEATURES.forEach(function (feature) {
    write(feature.file, 'function create() { return { destroy: function () {} }; }\n');
  });
  write('app/app.js', 'not valid JavaScript');
  write('app/player.js', 'not valid JavaScript');
  assert.doesNotThrow(function () { Contracts.analyzeProject(temp); });
  assert.doesNotThrow(function () { Maintainability.checkProject(temp); });
  assert.throws(function () { RuntimeEs5.checkFiles(RuntimeEs5.collectRuntimeFiles(temp)); }, /ECMAScript 5/,
    'generated artifacts must NOT escape the runtime parser');
  write('app/authored.js', 'not valid JavaScript');
  assert.throws(function () { Contracts.analyzeProject(temp); }, /authored|Unexpected/);
  assert.throws(function () { Maintainability.checkProject(temp); }, /authored|Unexpected/);

  fs.rmSync(path.join(temp, 'app'), { recursive: true, force: true });
  write('app/app.js', 'var core = true;');
  write('app/player.js', 'var player = 1;');
  function cacheKey() {
    var result = childProcess.spawnSync(process.execPath, [path.join(root, 'scripts/asset-cache-key.js'), path.join(temp, 'app')], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, result.stderr);
    return result.stdout;
  }
  var before = cacheKey();
  write('app/player.js', 'var player = 2;');
  assert.notStrictEqual(cacheKey(), before, 'a deferred-only change must change the shared release cache identity');
  var config = JSON.parse(fs.readFileSync(path.join(root, 'jsconfig.json'), 'utf8'));
  assert.ok(config.exclude.indexOf('app/player.js') !== -1, 'generated Player output follows Core typecheck exclusion');
  var eslint = require('../eslint.config');
  assert.ok(eslint.some(function (entry) { return entry.ignores && entry.ignores.indexOf('app/player.js') !== -1; }));
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log('Generated Player freshness, inventory, ES5, and cache guards passed');
