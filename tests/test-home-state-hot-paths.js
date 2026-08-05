'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var source = fs.readFileSync(path.join(__dirname, '..', 'app', 'home-state.js'), 'utf8');
var start = source.indexOf('function createRefreshCoordinator(');
var end = source.indexOf('function createPoller(', start);
var body = source.slice(start, end);

assert.ok(start >= 0 && end > start, 'Home refresh coordinator source must be available');
assert.strictEqual((body.match(/normalizeRows\(rows\)/g) || []).length, 1,
  'one Home response must be normalized only once');
assert.ok(/nextFingerprint = fingerprintNormalizedRows\(normalized\)/.test(body),
  'Home fingerprinting must reuse the normalized response');

console.log('Home state hot-path checks passed');
