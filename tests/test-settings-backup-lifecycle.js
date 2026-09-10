'use strict';

var assert = require('assert');
var Store = require('../app/plex-settings-backup-store');
var Format = require('../app/settings-backup-format');
var Settings = require('../app/settings');

function fixture(hasProfile) {
  var values = {};
  var writes = [];
  var requests = [];
  var storage = {
    getItem: function (key) { return values[key] || null; },
    setItem: function (key, value) { values[key] = String(value); writes.push(key); },
    removeItem: function (key) { delete values[key]; writes.push(key); },
    key: function (index) { return Object.keys(values)[index] || null; },
    get length() { return Object.keys(values).length; }
  };
  var current = Settings.validate({ uiLanguage: 'en', settingsBackupMode: 'off' });
  var built = Format.build(storage, Settings.validate({ uiLanguage: 'it' }), '1.0.7', function () { return 1000; },
    { device: { id: 'saved', name: 'Living room', model: 'OLED55' } });
  var item = { ratingKey: 'save-1', title: Format.devicePlaylistTitle('Living room'), summary: built.summary };
  Settings.save(storage, current);
  if (hasProfile) { storage.setItem(Store.DEVICE_PROFILE_KEY, JSON.stringify({ id: 'saved', name: 'Living room' })); }
  writes.length = 0;
  var store = Store.create({
    storage: storage,
    settings: function () { return current; },
    config: function () { return { apiBaseUrl: 'http://test.invalid', token: 'fixture' }; },
    deviceInfo: function () { return { modelName: 'OLED55' }; },
    appVersion: '1.0.7', now: function () { return 2000; }, random: function () { return 0.5; },
    transport: {
      list: function (_config, _prefix, _marker, callback) { requests.push({ method: 'list', callback: callback }); },
      create: function (_config, _title, callback) { requests.push({ method: 'create', callback: callback }); },
      update: function (_config, _id, _summary, callback) { requests.push({ method: 'update', callback: callback }); },
      remove: function (_config, _id, callback) { requests.push({ method: 'remove', callback: callback }); }
    }
  });
  return { store: store, storage: storage, writes: writes, requests: requests, item: item };
}
var failures = 0;
function test(name, run) {
  try { run(); console.log('PASS ' + name); }
  catch (error) { failures += 1; console.error('FAIL ' + name + '\n' + error.stack); }
}

['status', 'load', 'save', 'remove'].forEach(function (method) {
  test('destroy suppresses pending ' + method + ' reads before storage or further writes', function () {
    var f = fixture(true); var calls = 0;
    function callback() { calls += 1; }
    if (method === 'load') { f.store.load('saved', { sameDevice: true }, callback); }
    else { f.store[method](callback); }
    assert.strictEqual(f.requests.length, 1); assert.strictEqual(f.requests[0].method, 'list');
    f.store.destroy(); f.store.destroy();
    f.requests[0].callback(null, [f.item]);
    assert.deepStrictEqual(f.writes, [], 'late ' + method + ' must not mutate local storage');
    assert.strictEqual(f.requests.length, 1, 'late reads must not start a remote write');
    assert.strictEqual(calls, 0, 'late results must not reach destroyed consumers');
    assert.strictEqual(Settings.load(f.storage).uiLanguage, 'en');
  });
});

test('registerDevice is inert after destruction rather than writing a new identity', function () {
  var f = fixture(false); var calls = 0;
  f.store.destroy(); f.store.registerDevice('New name', function () { calls += 1; });
  assert.deepStrictEqual(f.writes, []); assert.strictEqual(f.requests.length, 0); assert.strictEqual(calls, 0);
});

test('remove without a profile is also inert after destruction', function () {
  var f = fixture(false); var calls = 0;
  f.store.destroy(); f.store.remove(function () { calls += 1; });
  assert.strictEqual(calls, 0); assert.strictEqual(f.requests.length, 0);
});

test('an accepted create/update transaction finishes without notifying a destroyed consumer', function () {
  var f = fixture(true); var calls = 0;
  f.store.save(function () { calls += 1; });
  f.requests[0].callback(null, []);
  assert.strictEqual(f.requests[1].method, 'create');
  f.store.destroy();
  f.requests[1].callback(null, { ratingKey: 'new-save' });
  assert.strictEqual(f.requests[2].method, 'update', 'finish an accepted create rather than leaving an empty save');
  f.requests[2].callback(null);
  assert.strictEqual(calls, 0); assert.deepStrictEqual(f.writes, []);
});

test('a failed accepted create/update transaction still removes its empty save after destruction', function () {
  var f = fixture(true); var calls = 0;
  f.store.save(function () { calls += 1; });
  f.requests[0].callback(null, []); f.store.destroy();
  f.requests[1].callback(null, { ratingKey: 'new-save' });
  f.requests[2].callback(new Error('update failed'));
  assert.strictEqual(f.requests[3].method, 'remove', 'retain the existing transaction rollback');
  f.requests[3].callback(null);
  assert.strictEqual(calls, 0); assert.deepStrictEqual(f.writes, []);
});

test('an accepted delete completes silently after destruction', function () {
  var f = fixture(true); var calls = 0;
  f.store.remove(function () { calls += 1; });
  f.requests[0].callback(null, [f.item]);
  assert.strictEqual(f.requests[1].method, 'remove');
  f.store.destroy(); f.requests[1].callback(null);
  assert.strictEqual(calls, 0); assert.deepStrictEqual(f.writes, []);
});

if (failures) { process.exitCode = 1; }
else { console.log('Settings backup lifecycle checks passed'); }
