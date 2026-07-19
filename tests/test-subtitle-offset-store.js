'use strict';

var assert = require('assert');
var Store = require('../app/subtitle-offset-store');

var values = {};
var storage = {
  getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
  setItem: function (key, value) { values[key] = value; },
  removeItem: function (key) { delete values[key]; }
};

assert.strictEqual(Store.get(storage, 'server-a', 'part-1', 'stream-1'), 0, 'missing offsets must default to zero');
Store.set(storage, 'server-a', 'part-1', 'stream-1', -350);
assert.strictEqual(Store.get(storage, 'server-a', 'part-1', 'stream-1'), -350, 'negative embedded offsets must persist');
assert.strictEqual(Store.get(storage, 'server-a', 'part-1', 'stream-2'), 0, 'streams in one part must remain isolated');
assert.strictEqual(Store.get(storage, 'server-a', 'part-2', 'stream-1'), 0, 'media parts must remain isolated');
assert.strictEqual(Store.get(storage, 'server-b', 'part-1', 'stream-1'), 0, 'Plex servers must remain isolated');

Store.set(storage, 'server-a', 'part-1', 'stream-1', 1250);
assert.strictEqual(Store.get(storage, 'server-a', 'part-1', 'stream-1'), 1250, 'existing offsets must be replaceable');
Store.set(storage, 'server-a', 'part-1', 'stream-1', 0);
assert.strictEqual(Store.get(storage, 'server-a', 'part-1', 'stream-1'), 0, 'saving zero must remove the redundant entry');

Store.set(storage, 'server/a', 'part|1', 'stream?1', 500);
assert.strictEqual(Store.get(storage, 'server/a', 'part|1', 'stream?1'), 500, 'encoded identity components must remain collision-safe');
assert.strictEqual(Store.set(storage, '', 'part', 'stream', 100), false, 'incomplete identities must not be persisted');
assert.strictEqual(Store.set(storage, 'server', 'part', 'stream', Infinity), false, 'non-finite offsets must be rejected');

values[Store.STORAGE_KEY] = '{broken json';
assert.strictEqual(Store.get(storage, 'server-a', 'part-1', 'stream-1'), 0, 'malformed storage must recover as empty');
assert.strictEqual(Store.remove(storage, 'server-a', 'part-1', 'stream-1'), true, 'removing from malformed storage must remain safe');

console.log('Subtitle offset store checks passed');
