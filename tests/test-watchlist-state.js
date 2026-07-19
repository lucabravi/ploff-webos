'use strict';

var assert = require('assert');
var WatchlistState = require('../shell/watchlist-state');

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

var original = [{ ratingKey: 'one' }];
var optimistic = WatchlistState.optimistic(original, { ratingKey: 'two' }, true);
assert.deepStrictEqual(optimistic.items.map(function (item) { return item.ratingKey; }), ['one', 'two'], 'optimistic add must update immediately');
assert.deepStrictEqual(optimistic.rollback(), original, 'failed optimistic mutations must restore the previous list');

console.log('Watchlist state checks passed');
