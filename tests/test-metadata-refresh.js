'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var modulePath = path.join(__dirname, '../shell/metadata-refresh.js');
assert.ok(fs.existsSync(modulePath), 'metadata refresh coordinator must exist');
var MetadataRefresh = require('../shell/metadata-refresh');

(function runsEachRefreshAfterThePreviousLevelHasReloaded() {
  var events = [];
  MetadataRefresh.run({
    keys: ['episode', 'season', 'show'],
    refresh: function (key, callback) {
      events.push('refresh:' + key);
      callback(null, 'activity:' + key);
    },
    wait: function (activityId, callback) {
      events.push('wait:' + activityId);
      callback();
    },
    reload: function (key, callback) {
      events.push('reload:' + key);
      callback(null);
    }
  }, function (error) {
    assert.ifError(error);
  });

  assert.deepStrictEqual(events, [
    'refresh:episode', 'wait:activity:episode', 'reload:episode',
    'refresh:season', 'wait:activity:season', 'reload:season',
    'refresh:show', 'wait:activity:show', 'reload:show'
  ]);
}());

(function removesEmptyAndDuplicateKeys() {
  var refreshed = [];
  MetadataRefresh.run({
    keys: ['episode', '', 'episode', null, 'show'],
    refresh: function (key, callback) { refreshed.push(key); callback(null, ''); },
    wait: function (activityId, callback) { callback(); },
    reload: function (key, callback) { callback(null); }
  }, function (error) { assert.ifError(error); });
  assert.deepStrictEqual(refreshed, ['episode', 'show']);
}());

(function stopsAtTheFirstError() {
  var events = [];
  MetadataRefresh.run({
    keys: ['episode', 'season'],
    refresh: function (key, callback) {
      events.push('refresh:' + key);
      callback(key === 'episode' ? new Error('refresh failed') : null, '');
    },
    wait: function (activityId, callback) { events.push('wait'); callback(); },
    reload: function (key, callback) { events.push('reload'); callback(null); }
  }, function (error) {
    assert.strictEqual(error.message, 'refresh failed');
  });
  assert.deepStrictEqual(events, ['refresh:episode']);
}());

console.log('Metadata refresh coordinator checks passed');
