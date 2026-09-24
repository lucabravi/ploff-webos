'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var source = fs.readFileSync(path.join(__dirname, '..', 'app', 'home-state.js'), 'utf8');
var shellSource = fs.readFileSync(path.join(__dirname, '..', 'app', 'coordinator', 'shell-controller.js'), 'utf8');
var start = source.indexOf('function createRefreshCoordinator(');
var end = source.indexOf('function createPoller(', start);
var body = source.slice(start, end);
var keyStart = shellSource.indexOf('function handleHomeKey(');
var keyEnd = shellSource.indexOf('function showMessage(', keyStart);
var keyBody = shellSource.slice(keyStart, keyEnd);

assert.ok(start >= 0 && end > start, 'Home refresh coordinator source must be available');
assert.strictEqual((body.match(/normalizeRows\(rows\)/g) || []).length, 1,
  'one Home response must be normalized only once');
assert.ok(!/fingerprintNormalizedRows\(/.test(body),
  'Home refresh comparison must not allocate a stable fingerprint tree/string on the polling hot path');
assert.ok(/rowsEqual\(normalized, previousRows\)/.test(body),
  'Home refresh comparison must reuse the normalized response with exact structural comparison');
assert.ok(keyStart >= 0 && keyEnd > keyStart, 'Home key handler source must be available');
assert.ok(!/rows\.map\(/.test(keyBody),
  'Home key handling must reuse cached row lengths instead of allocating an array on every keypress');

console.log('Home state hot-path checks passed');
