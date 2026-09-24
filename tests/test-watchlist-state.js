'use strict';

var assert = require('assert');
var WatchlistState = require('../app/watchlist-state');

assert.strictEqual(WatchlistState.available('offline', 'token'), false, 'offline mode must disable Watchlist');
assert.strictEqual(WatchlistState.available('plex', ''), false, 'missing account tokens must disable Watchlist');
assert.strictEqual(WatchlistState.available('plex', 'token'), true, 'linked Plex accounts must enable Watchlist');
assert.strictEqual(WatchlistState.statusKey(true, null, 0), 'watchlist.loading', 'loading must use the inline Watchlist status');
assert.strictEqual(WatchlistState.statusKey(false, new Error('failed'), 0), 'state.watchlistError', 'errors must remain inline instead of stealing focus');
assert.strictEqual(WatchlistState.statusKey(false, null, 0), 'watchlist.empty', 'empty Watchlists must remain inline');
assert.strictEqual(WatchlistState.statusKey(false, null, 2), '', 'loaded Watchlists must clear their inline status');

var cloud = [
  { ratingKey: 'cloud-1', guid: 'plex://movie/one' },
  { ratingKey: 'cloud-2', guid: 'plex://show/two' },
  { ratingKey: 'cloud-duplicate', guid: 'plex://movie/one' },
  { ratingKey: 'cloud-missing', guid: 'plex://movie/missing' },
  { ratingKey: 'cloud-3', guid: 'plex://movie/three' }
];
var pending = [];
var active = 0;
var maximum = 0;
var resolved = null;
WatchlistState.resolve(cloud, function (guid, callback) {
  active += 1; maximum = Math.max(maximum, active);
  pending.push(function () {
    active -= 1;
    callback(null, guid.indexOf('missing') === -1 ? { ratingKey: guid.split('/').pop(), guid: guid } : null);
  });
}, 2, function (error, items) {
  assert.ifError(error); resolved = items;
});
while (pending.length) { pending.shift()(); }
assert.strictEqual(maximum, 2, 'local GUID resolution must respect its concurrency cap');
assert.deepStrictEqual(resolved.map(function (item) { return item.ratingKey; }), ['one', 'two', 'three'], 'resolution must preserve order, omit missing media, and suppress duplicate GUIDs');
assert.strictEqual(resolved[0].cloudRatingKey, 'cloud-1', 'local matches must retain their cloud mutation key');

var partialError = null;
var partialItems = null;
var partialPending = [];
WatchlistState.resolve([
  { ratingKey: 'cloud-ok', guid: 'plex://movie/ok' },
  { ratingKey: 'cloud-fail', guid: 'plex://movie/fail' }
], function (guid, callback) {
  partialPending.push(function () {
    if (guid.indexOf('/fail') !== -1) { callback(new Error('offline')); }
    else { callback(null, { ratingKey: 'ok', guid: guid }); }
  });
}, 2, function (error, items) {
  partialError = error;
  partialItems = items;
});
while (partialPending.length) { partialPending.shift()(); }
assert.ok(partialError, 'real local-resolution errors must propagate instead of being silently cached as a successful partial Watchlist');
assert.deepStrictEqual(partialItems.map(function (item) { return item.ratingKey; }), ['ok'], 'successful local matches should remain available alongside a retryable resolution error');

var original = [{ ratingKey: 'one' }];
var optimistic = WatchlistState.optimistic(original, { ratingKey: 'two' }, true);
assert.deepStrictEqual(optimistic.items.map(function (item) { return item.ratingKey; }), ['one', 'two'], 'optimistic add must update immediately');
assert.deepStrictEqual(optimistic.rollback(), original, 'failed optimistic mutations must restore the previous list');

var crossServer = [
  { ratingKey: 'same', serverMachineIdentifier: 'server-a' },
  { ratingKey: 'same', serverMachineIdentifier: 'server-b' }
];
var removeServerB = WatchlistState.optimistic(crossServer, { ratingKey: 'same', serverMachineIdentifier: 'server-b' }, false);
assert.deepStrictEqual(removeServerB.items.map(function (item) { return item.serverMachineIdentifier; }), ['server-a'],
  'Watchlist optimistic removal must not remove the same ratingKey from another PMS');

console.log('Watchlist state checks passed');
