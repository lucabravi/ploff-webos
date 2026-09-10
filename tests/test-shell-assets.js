'use strict';

var assert = require('assert');
var childProcess = require('child_process');
var fs = require('fs');
var os = require('os');
var path = require('path');

var checker = path.resolve(__dirname, '../scripts/check-shell-assets.js');
var directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ploff-shell-assets-'));

function write(name, contents) {
  var target = path.join(directory, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents || '');
}

function check(html) {
  write('index.html', html);
  return childProcess.spawnSync(process.execPath, [checker, path.join(directory, 'index.html'), 'dev'], {
    encoding: 'utf8'
  });
}

write('app.js');
write('player.js', 'var player = true;');
write('vendor/library.js');

assert.strictEqual(
  check('<script src="app.js?v=dev"></script><script src="vendor/library.js?v=1.2.13"></script>').status,
  0,
  'pinned vendored libraries should keep their upstream semantic version'
);

assert.notStrictEqual(
  check('<script src="app.js?v=stale"></script>').status,
  0,
  'application assets must use the expected application cache key'
);

assert.notStrictEqual(
  check('<script src="vendor/library.js?v=custom"></script>').status,
  0,
  'vendored libraries must use an explicit semantic version'
);

assert.notStrictEqual(check('<script src="app.js?v=dev"></script><script src="player.js?v=dev"></script>').status, 0,
  'Player code must not be a static startup script');
fs.unlinkSync(path.join(directory, 'player.js'));
assert.notStrictEqual(check('<script src="app.js?v=dev"></script>').status, 0,
  'release validation must reject a missing deferred asset even though it is not in HTML');
write('player.js');
assert.notStrictEqual(check('<script src="app.js?v=dev"></script>').status, 0, 'an empty Player asset must fail validation');
fs.rmSync(directory, { recursive: true, force: true });
console.log('Shell asset checker tests passed');
