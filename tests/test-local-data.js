'use strict';

var assert = require('assert');
var LocalData = require('../app/local-data');

function storage(values) {
  var data = values || {};
  return {
    get length() { return Object.keys(data).length; },
    key: function (index) { return Object.keys(data)[index] || null; },
    removeItem: function (key) { delete data[key]; },
    values: function () { return data; }
  };
}

var fixture = storage({
  'ploff.auth.v1': 'credentials',
  'ploff.settings.v1': 'settings',
  'ploff.mediaPreference.v1.example': 'preference',
  unrelated: 'keep'
});

assert.strictEqual(LocalData.clear(fixture), 3, 'all Ploff-owned records must be removed');
assert.deepStrictEqual(fixture.values(), { unrelated: 'keep' }, 'unrelated origin data must be preserved');
assert.strictEqual(LocalData.clear(null), 0, 'missing storage must be harmless');
var partial = storage({ 'ploff.one': 'one', 'ploff.two': 'two', unrelated: 'keep' });
var originalRemove = partial.removeItem;
partial.removeItem = function (key) {
  if (key === 'ploff.one') { throw new Error('blocked'); }
  originalRemove(key);
};
assert.strictEqual(LocalData.clear(partial), 1, 'local data cleanup must continue after an individual removal failure');
assert.deepStrictEqual(partial.values(), { 'ploff.one': 'one', unrelated: 'keep' }, 'failed removals must not prevent other Ploff data from being cleared');
assert.strictEqual(LocalData.clear({
  get length() { throw new Error('blocked'); },
  key: function () {},
  removeItem: function () {}
}), 0, 'unreadable local storage must not break the delete-local-data action');
console.log('Local data checks passed');
