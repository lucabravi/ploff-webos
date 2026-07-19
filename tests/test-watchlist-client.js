'use strict';

var assert = require('assert');
var WatchlistClient = require('../shell/watchlist-client');

var requests = [];
var root = {
  XMLHttpRequest: function () {
    requests.push(this);
    this.headers = {};
    this.open = function (method, url) { this.method = method; this.url = url; };
    this.setRequestHeader = function (name, value) { this.headers[name] = value; };
    this.send = function () {};
    this.abort = function () { this.aborted = true; };
  }
};

var discovered;
WatchlistClient.discover(root, { baseUrl: 'https://discover.provider.plex.tv', token: 'account-token', timeout: 5000 }, function (error, provider) {
  assert.ifError(error);
  discovered = provider;
});
assert.strictEqual(requests[0].method, 'GET', 'provider discovery must use GET');
assert.strictEqual(requests[0].headers['X-Plex-Token'], 'account-token', 'provider discovery must authenticate with the account token header');
requests[0].status = 200;
requests[0].responseText = JSON.stringify({ MediaProvider: { Feature: [
  { type: 'content', key: '/library/sections/watchlist/all' },
  { type: 'universalsearch', key: '/library/search' },
  { type: 'action', action: 'addToWatchlist', key: '/actions/addToWatchlist' },
  { type: 'action', action: 'removeFromWatchlist', key: '/actions/removeFromWatchlist' }
] } });
requests[0].readyState = 4; requests[0].onreadystatechange();
assert.deepStrictEqual(discovered, {
  baseUrl: 'https://discover.provider.plex.tv',
  watchlistPath: '/library/sections/watchlist/all',
  searchPath: '/library/search',
  addPath: '/actions/addToWatchlist',
  removePath: '/actions/removeFromWatchlist'
}, 'provider feature discovery must retain content and mutation endpoints');

assert.deepStrictEqual(WatchlistClient.providerFromJson(JSON.stringify({ MediaProvider: { Feature: [{
  type: 'metadata',
  Directory: [{ key: '/library/sections/watchlist/all' }],
  Feature: [{ type: 'universalsearch', key: '/library/search' }],
  Action: [
    { id: 'addToWatchlist', key: '/actions/addToWatchlist' },
    { id: 'removeFromWatchlist', key: '/actions/removeFromWatchlist' }
  ]
}] } }), 'https://discover.provider.plex.tv'), discovered, 'nested provider features must expose the live Watchlist endpoints');

var cloudSearch;
WatchlistClient.search(root, { token: 'account-token', provider: discovered, timeout: 5000 }, 'attack', 12, function (error, items) {
  assert.ifError(error); cloudSearch = items;
});
assert.ok(/\/library\/search\?/.test(requests[1].url) && /query=attack/.test(requests[1].url) && /limit=12/.test(requests[1].url), 'cloud alias search must use the discovered provider search endpoint');
assert.ok(/searchProviders=discover/.test(requests[1].url) && /searchTypes=movies%2Ctv/.test(requests[1].url) && /includeMetadata=1/.test(requests[1].url), 'universal search must request movie and TV metadata from Plex Discover');
requests[1].status = 200;
requests[1].responseText = JSON.stringify({ MediaContainer: { SearchResults: [{ id: 'external', SearchResult: [
  { score: 0.64, Metadata: { type: 'show', title: 'Attack on Titan', guid: 'plex://show/attack' } },
  { score: 0.31, Metadata: { type: 'episode', title: 'Ignored episode', guid: 'plex://episode/ignored' } }
] }] } });
requests[1].readyState = 4; requests[1].onreadystatechange();
assert.deepStrictEqual(cloudSearch, [{ ratingKey: '', type: 'show', title: 'Attack on Titan', guid: 'plex://show/attack', score: 0.64 }], 'cloud search must retain provider score with top-level media GUIDs');

var loaded;
WatchlistClient.load(root, { token: 'account-token', provider: discovered, timeout: 5000 }, 20, 200, function (error, items) {
  assert.ifError(error); loaded = items;
});
assert.ok(/X-Plex-Container-Start=20/.test(requests[2].url) && /X-Plex-Container-Size=100/.test(requests[2].url), 'Watchlist requests must remain paged and respect the provider maximum');
requests[2].status = 200;
requests[2].responseText = JSON.stringify({ MediaContainer: { Metadata: [
  { ratingKey: 'cloud-1', type: 'movie', title: 'Alien', guid: 'plex://movie/alien' },
  { ratingKey: 'cloud-2', type: 'show', title: 'Anime', Guid: [{ id: 'plex://show/anime' }] }
] } });
requests[2].readyState = 4; requests[2].onreadystatechange();
assert.deepStrictEqual(loaded.map(function (item) { return [item.ratingKey, item.guid]; }), [
  ['cloud-1', 'plex://movie/alien'], ['cloud-2', 'plex://show/anime']
], 'Watchlist responses must normalize Plex GUIDs');

var mutationDone = false;
WatchlistClient.set(root, { token: 'account-token', provider: discovered, timeout: 5000 }, 'cloud-1', true, function (error) { mutationDone = !error; });
assert.strictEqual(requests[3].method, 'PUT', 'Watchlist mutations must use PUT');
assert.ok(/\/actions\/addToWatchlist/.test(requests[3].url) && /ratingKey=cloud-1/.test(requests[3].url), 'adding must target the discovered action');
requests[3].status = 200; requests[3].readyState = 4; requests[3].onreadystatechange();
assert.strictEqual(mutationDone, true, 'successful Watchlist mutations must complete');

var unavailableError = null;
WatchlistClient.discover(root, { token: 'bad' }, function (error) { unavailableError = error; });
requests[4].status = 401; requests[4].readyState = 4; requests[4].onreadystatechange();
assert.ok(unavailableError, 'account authorization errors must mark Watchlist unavailable');

var aborted = WatchlistClient.load(root, { token: 'account-token', provider: discovered }, 0, 10, function () {});
aborted.abort();
assert.strictEqual(requests[5].aborted, true, 'Watchlist requests must be abortable');

var abortedCallbacks = 0;
var staleRequest = WatchlistClient.load(root, { token: 'account-token', provider: discovered }, 0, 10, function () { abortedCallbacks += 1; });
requests[6].abort = function () {
  this.aborted = true;
  this.status = 0;
  this.readyState = 4;
  if (this.onreadystatechange) { this.onreadystatechange(); }
};
staleRequest.abort();
assert.strictEqual(abortedCallbacks, 0, 'intentionally aborted Watchlist requests must not publish stale errors');

var deferredWatchlistFailure = null;
var immediateWatchlistCallbacks = 0;
var failingRoot = {
  setTimeout: function (callback) { deferredWatchlistFailure = callback; return 1; },
  XMLHttpRequest: function () {
    this.open = function () { throw new Error('invalid endpoint'); };
    this.abort = function () {};
  }
};
WatchlistClient.discover(failingRoot, { token: 'account-token' }, function () { immediateWatchlistCallbacks += 1; });
assert.strictEqual(immediateWatchlistCallbacks, 0, 'synchronous Watchlist failures must not race caller state');
deferredWatchlistFailure();
assert.strictEqual(immediateWatchlistCallbacks, 1, 'synchronous Watchlist failures must complete asynchronously');

console.log('Watchlist client checks passed');
