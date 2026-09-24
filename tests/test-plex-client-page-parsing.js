'use strict';

var assert = require('assert');
var PlexClient = require('../app/plex-client');

function node(name, attributes, children) {
  var source = attributes || {};
  return {
    nodeType: 1,
    nodeName: name,
    attributes: Object.keys(source).map(function (key) { return { name: key, value: String(source[key]) }; }),
    childNodes: children || [],
    getAttribute: function (key) { return source[key] === undefined ? null : String(source[key]); }
  };
}

function documentFor(items, total) {
  return {
    documentElement: node('MediaContainer', { totalSize: total }, items),
    getElementsByTagName: function (name) { return name === 'parsererror' ? [] : []; }
  };
}

function documentWithPageSize(items) {
  return {
    documentElement: node('MediaContainer', { size: items.length }, items),
    getElementsByTagName: function (name) { return name === 'parsererror' ? [] : []; }
  };
}

var previousDomParser = global.DOMParser;
var previousXhr = global.XMLHttpRequest;
var parseCount = 0;
var nextDocument = null;
var xhr = null;

global.DOMParser = function () {
  this.parseFromString = function () {
    parseCount += 1;
    return nextDocument;
  };
};

global.XMLHttpRequest = function () {
  xhr = this;
  this.open = function () {};
  this.send = function () {};
  this.abort = function () {};
};

nextDocument = documentFor([
  node('Video', { type: 'movie', ratingKey: '1', title: 'One' }),
  node('Video', { type: 'movie', ratingKey: '2', title: 'Two' })
], 2);
var libraryPage = null;
PlexClient.loadLibraryPage({ apiBaseUrl: '/plex-api', token: '' }, { key: '1' }, 'catalog', {}, 0, 40, function (error, page) {
  assert.ifError(error);
  libraryPage = page;
});
xhr.status = 200;
xhr.readyState = 4;
xhr.responseText = '<xml/>';
xhr.onreadystatechange();
assert.strictEqual(parseCount, 1, 'a library page must parse its XML document once');
assert.strictEqual(libraryPage.items.length, 2);
assert.strictEqual(libraryPage.totalSize, 2);
assert.strictEqual(libraryPage.nextStart, 2, 'library pagination must expose the next raw Plex offset');
assert.strictEqual(libraryPage.hasMore, false, 'a library page ending at totalSize must be terminal');


parseCount = 0;
nextDocument = documentFor([
  node('Directory', { type: 'show', ratingKey: '6472', title: 'Horimiya', leafCount: '13', viewedLeafCount: '13' }),
  node('Directory', { type: 'show', ratingKey: 'partial-show', title: 'Partial', leafCount: '13', viewedLeafCount: '12' }),
  node('Video', { type: 'movie', ratingKey: 'unwatched-movie', title: 'Unwatched movie', viewCount: '0' })
], 180);
var correctedUnwatchedPage = null;
PlexClient.loadLibraryPage({ apiBaseUrl: '/plex-api', token: '' }, { key: '1' }, 'catalog', { watched: 'unwatched' }, 120, 3, function (error, page) {
  assert.ifError(error);
  correctedUnwatchedPage = page;
});
xhr.status = 200;
xhr.readyState = 4;
xhr.responseText = '<xml/>';
xhr.onreadystatechange();
assert.deepStrictEqual(correctedUnwatchedPage.items.map(function (item) { return item.ratingKey; }), ['partial-show', 'unwatched-movie'],
  'unwatched catalog pages must locally reject a Plex show whose leaf counters say it is fully viewed');
assert.strictEqual(correctedUnwatchedPage.nextStart, 123,
  'local unwatched correction must advance by all raw Plex rows, including a rejected fully-viewed show');
assert.strictEqual(correctedUnwatchedPage.hasMore, true,
  'local unwatched correction must preserve the raw Plex continuation boundary');
assert.strictEqual(correctedUnwatchedPage.items[0].plexSourceOffset, 121,
  'visible catalog items must retain their absolute raw Plex offset after local filtering');
assert.strictEqual(correctedUnwatchedPage.items[1].plexSourceOffset, 122,
  'every surviving catalog item must retain its raw Plex offset');
assert.strictEqual(correctedUnwatchedPage.localFilteredCount, 1,
  'the page must expose how many raw Plex rows were rejected by the local semantic correction');

parseCount = 0;
nextDocument = documentFor([
  node('Directory', { type: 'show', ratingKey: 'zero-leaf', title: 'Unknown empty', leafCount: '0', viewedLeafCount: '0' }),
  node('Directory', { type: 'season', ratingKey: 'over-count', title: 'Over count', leafCount: '10', viewedLeafCount: '11' }),
  node('Video', { type: 'movie', ratingKey: 'plex-watched-movie', title: 'Watched movie', viewCount: '1' }),
  node('Directory', { type: 'show', ratingKey: 'missing-counts', title: 'Missing counters' })
], 4);
var correctedEdgePage = null;
PlexClient.loadLibraryPage({ apiBaseUrl: '/plex-api', token: '' }, { key: '1' }, 'catalog', { watched: 'unwatched' }, 0, 4, function (error, page) {
  assert.ifError(error);
  correctedEdgePage = page;
});
xhr.status = 200;
xhr.readyState = 4;
xhr.responseText = '<xml/>';
xhr.onreadystatechange();
assert.deepStrictEqual(correctedEdgePage.items.map(function (item) { return item.ratingKey; }), ['zero-leaf', 'missing-counts'],
  'unwatched correction must reject semantically watched records but keep zero/missing leaf counters as unknown rather than completed');
assert.strictEqual(correctedEdgePage.nextStart, 4,
  'terminal local correction must still consume every raw Plex row');
assert.strictEqual(correctedEdgePage.hasMore, false,
  'terminal local correction must remain terminal even when some raw rows are rejected');

parseCount = 0;
nextDocument = documentFor([
  node('Directory', { type: 'show', ratingKey: 'complete-all', title: 'Complete all', leafCount: '13', viewedLeafCount: '13' })
], 1);
var uncorrectedAllPage = null;
PlexClient.loadLibraryPage({ apiBaseUrl: '/plex-api', token: '' }, { key: '1' }, 'catalog', { watched: 'all' }, 0, 40, function (error, page) {
  assert.ifError(error);
  uncorrectedAllPage = page;
});
xhr.status = 200;
xhr.readyState = 4;
xhr.responseText = '<xml/>';
xhr.onreadystatechange();
assert.strictEqual(uncorrectedAllPage.items.length, 1,
  'the local semantic correction must be scoped to the unwatched filter only');

parseCount = 0;
nextDocument = documentFor([
  node('Playlist', { ratingKey: 'playlist-1', key: '/playlists/1/items', title: 'One', leafCount: 2 }),
  node('Playlist', { ratingKey: 'playlist-empty', key: '/playlists/empty/items', title: 'Empty', leafCount: 0 }),
  node('Playlist', { ratingKey: 'playlist-2', key: '/playlists/2/items', title: 'Two', leafCount: 1 })
], 120);
var playlistsPage = null;
PlexClient.loadLibraryPage({ apiBaseUrl: '/plex-api', token: '' }, { key: 'playlists' }, 'playlists', {}, 40, 40, function (error, page) {
  assert.ifError(error);
  playlistsPage = page;
});
xhr.status = 200;
xhr.readyState = 4;
xhr.responseText = '<xml/>';
xhr.onreadystatechange();
assert.strictEqual(parseCount, 1, 'a playlist catalog page must parse its XML document once');
assert.strictEqual(playlistsPage.items.length, 2);
assert.strictEqual(playlistsPage.items.some(function (item) { return item.ratingKey === 'playlist-empty'; }), false,
  'empty playlists must remain hidden from every Ploff playlist catalog');
assert.strictEqual(playlistsPage.totalSize, 120, 'playlist pagination must preserve Plex totalSize across pages');
assert.strictEqual(playlistsPage.nextStart, 43, 'playlist pagination must advance by raw Plex entries, including filtered empty playlists');
assert.strictEqual(playlistsPage.hasMore, true, 'playlist pagination must preserve a known later boundary');

parseCount = 0;
nextDocument = documentFor([
  node('Video', { type: 'movie', ratingKey: '3', title: 'Three' })
], 1);
var containerPage = null;
PlexClient.loadLibraryContainerPage({ apiBaseUrl: '/plex-api', token: '' }, { containerKey: '/playlists/1/items' }, 0, 40, function (error, page) {
  assert.ifError(error);
  containerPage = page;
});
xhr.status = 200;
xhr.readyState = 4;
xhr.responseText = '<xml/>';
xhr.onreadystatechange();
assert.strictEqual(parseCount, 1, 'a paginated container page must parse its XML document once');
assert.strictEqual(containerPage.items.length, 1);
assert.strictEqual(containerPage.totalSize, 1);
assert.strictEqual(containerPage.nextStart, 1, 'container pagination must expose the next absolute offset');
assert.strictEqual(containerPage.hasMore, false, 'a terminal container page must stop pagination');

parseCount = 0;
nextDocument = documentWithPageSize([
  node('Video', { type: 'movie', ratingKey: 'late-1', title: 'Late One' }),
  node('Video', { type: 'movie', ratingKey: 'late-2', title: 'Late Two' })
]);
var incompleteTotalPage = null;
PlexClient.loadLibraryContainerPage({ apiBaseUrl: '/plex-api', token: '' }, { containerKey: '/playlists/late/items' }, 40, 40, function (error, page) {
  assert.ifError(error);
  incompleteTotalPage = page;
});
xhr.status = 200;
xhr.readyState = 4;
xhr.responseText = '<xml/>';
xhr.onreadystatechange();
assert.strictEqual(incompleteTotalPage.totalSize, 42,
  'a page without totalSize must never report fewer items than its absolute end');
assert.strictEqual(incompleteTotalPage.nextStart, 42, 'unknown totals must still advance by the raw page count');
assert.strictEqual(incompleteTotalPage.hasMore, false, 'a short page without totalSize must establish a terminal boundary');

parseCount = 0;
nextDocument = documentFor([
  node('Video', { type: 'episode', ratingKey: 'episode-1', parentRatingKey: 'season-1', grandparentTitle: 'Show', parentTitle: 'Season 1', parentIndex: 1, index: 1 }),
  node('Video', { type: 'episode', ratingKey: 'episode-2', parentRatingKey: 'season-1', grandparentTitle: 'Show', parentTitle: 'Season 1', parentIndex: 1, index: 2 })
], 4);
var recentPage = null;
PlexClient.loadLibraryPage({ apiBaseUrl: '/plex-api', token: '' }, { key: '1' }, 'recent', {}, 0, 2, function (error, page) {
  assert.ifError(error);
  recentPage = page;
});
xhr.status = 200;
xhr.readyState = 4;
xhr.responseText = '<xml/>';
xhr.onreadystatechange();
assert.strictEqual(recentPage.items.length, 2, 'two adjacent recent episodes must remain separate cards');
assert.strictEqual(recentPage.nextStart, 2, 'recent pagination must advance by raw episodes rather than visible grouped cards');
assert.strictEqual(recentPage.hasMore, true, 'recent pagination must retain the raw Plex continuation state');
assert.ok(recentPage.items.every(function (item) { return item.recentGroup.count === 1; }),
  'ungrouped recent cards must retain one raw episode each for cross-page adjacency checks');
assert.ok(recentPage.items.every(function (item) { return item.detailKey === 'media.episodeNumber'; }),
  'ungrouped recent cards must use spoiler-safe episode-number presentation');
assert.strictEqual(recentPage.items[0].recentGroup.seasonItem.type, 'season', 'recent episode cards must retain a stable season presentation template');

parseCount = 0;
nextDocument = documentFor([
  node('Video', { type: 'episode', ratingKey: 'episode-3', parentRatingKey: 'season-2', grandparentTitle: 'Show', parentTitle: 'Season 2', parentIndex: 2, index: 1, viewCount: 1 })
], 2);
var recentSingletonPage = null;
PlexClient.loadLibraryPage({ apiBaseUrl: '/plex-api', token: '' }, { key: '1' }, 'recent', {}, 0, 1, function (error, page) {
  assert.ifError(error);
  recentSingletonPage = page;
});
xhr.status = 200;
xhr.readyState = 4;
xhr.responseText = '<xml/>';
xhr.onreadystatechange();
assert.strictEqual(recentSingletonPage.items[0].type, 'episode', 'a recent singleton must preserve episode presentation');
assert.strictEqual(recentSingletonPage.items[0].recentGroup.key, 'season-2', 'a recent singleton must retain its cross-page season identity');
assert.strictEqual(recentSingletonPage.items[0].recentGroup.viewedCount, 1, 'recent grouping metadata must preserve per-page viewed state');
assert.strictEqual(recentSingletonPage.nextStart, 1, 'recent singleton pagination must still advance by one raw item');
assert.strictEqual(recentSingletonPage.hasMore, true, 'recent singleton pagination must preserve a known following page');

global.DOMParser = previousDomParser;
global.XMLHttpRequest = previousXhr;

console.log('Plex client page parsing checks passed');
