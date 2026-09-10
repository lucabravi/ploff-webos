'use strict';

var assert = require('assert');
var SearchModel = require('../app/search-model');
var HomeModel = require('../app/plex-home-model');
var MediaMapper = require('../app/plex-media-mapper');
var SearchParser = require('../app/plex-search-parser').create({ mediaFromAttributes: MediaMapper.mediaFromAttributes });
var WatchlistState = require('../app/watchlist-state');
var MediaProfile = require('../app/media-profile');
var DOMParser = require('@xmldom/xmldom').DOMParser;
var originalParser = global.DOMParser;
var keys = ['constructor', '__proto__', 'toString', 'normal'];
var failures = [];
var count = 0;

function check(name, test) {
  count += 1;
  try { test(); }
  catch (error) { failures.push(name + ': ' + error.message); }
}
function items() {
  return keys.map(function (key, index) {
    return { ratingKey: key, guid: key, title: 'Match ' + index, type: 'movie' };
  });
}
function identities(values) { return values.map(function (item) { return item.ratingKey; }); }

check('local search preserves external keys and first-wins identity without mutating inputs', function () {
  var source = items();
  var duplicate = { ratingKey: 'constructor', title: 'Later duplicate' };
  var before = JSON.stringify(source);
  var result = SearchModel.mergeLocalResults(source, [duplicate, null, { title: 'No key' }]);
  assert.deepStrictEqual(identities(result), keys);
  assert.strictEqual(result[0], source[0]);
  assert.strictEqual(JSON.stringify(source), before);
});
check('cloud search filters relevance without inherited-key collisions', function () {
  var source = items();
  assert.deepStrictEqual(SearchModel.relevantCloudItems('match', source.concat([
    { guid: '__proto__', title: 'Match duplicate' }, { guid: 'excluded', title: 'Unrelated' }
  ])), source);
});
check('search attribute mapping retains metadata and supported kinds', function () {
  var source = items().map(function (item) { return Object.assign({ librarySectionTitle: 'Library' }, item); });
  var result = SearchParser.searchItemsFromAttributes(source.concat([
    { ratingKey: '__proto__', title: 'Match duplicate', type: 'movie' },
    { ratingKey: 'episode', title: 'Match episode', type: 'episode' }
  ]), 'http://server', 'token', 'match');
  assert.deepStrictEqual(identities(result), keys);
  assert.ok(result.every(function (item) { return item.libraryTitle === 'Library'; }));
});
check('round-robin recommendations retain opaque identities, limit, and input order', function () {
  var source = items();
  var lists = [[source[0], source[1], source[2]], [source[1], source[3], source[0]]];
  var before = JSON.stringify(lists);
  assert.deepStrictEqual(HomeModel.mergeRecommendedItems(lists, 4), [source[0], source[1], source[2], source[3]]);
  assert.deepStrictEqual(HomeModel.mergeRecommendedItems(lists, 2), [source[0], source[1]]);
  assert.strictEqual(JSON.stringify(lists), before);
});
check('Watchlist resolution keeps original order and deduplicates only actual GUIDs', function () {
  var source = items();
  var pending = [];
  var result;
  var calls = 0;
  var local = { ratingKey: 'local', title: 'Local' };
  WatchlistState.resolve(source.concat([source[1]]), function (guid, callback) {
    pending.push({ guid: guid, callback: callback });
  }, 4, function (error, values) { assert.ifError(error); calls += 1; result = values; });
  assert.deepStrictEqual(pending.map(function (item) { return item.guid; }), keys);
  pending.reverse().forEach(function (item) { item.callback(null, local); });
  assert.strictEqual(calls, 1);
  assert.deepStrictEqual(result.map(function (item) { return item.cloudGuid; }), keys);
  assert.deepStrictEqual(result.map(function (item) { return item.cloudRatingKey; }), keys);
  assert.ok(result.every(function (item) { return item.inWatchlist && item.ratingKey === 'local'; }));
  assert.deepStrictEqual(local, { ratingKey: 'local', title: 'Local' });
});
check('subtitle language labels use normalized values, not inherited properties', function () {
  assert.deepStrictEqual(MediaProfile.subtitleLanguages({ subtitleTracks: [
    { languageCode: 'constructor', language: 'First' },
    { languageTag: '__proto__', language: 'Second' },
    { languageCode: 'CONSTRUCTOR', language: 'Duplicate' },
    { languageCode: 'en', language: 'English' },
    { languageCode: 'EN', language: 'Duplicate English' }
  ] }), ['First', 'Second', 'English']);
});
check('recent season grouping counts external keys and watched episodes correctly', function () {
  var source = [];
  keys.forEach(function (key) {
    source.push({ type: 'episode', parentRatingKey: key, parentTitle: key, viewCount: '0' });
    source.push({ type: 'episode', parentRatingKey: key, parentTitle: key, viewCount: '1' });
  });
  var before = JSON.stringify(source);
  var result = MediaMapper.groupRecentAttributes(source);
  assert.deepStrictEqual(identities(result), keys);
  assert.ok(result.every(function (item) { return item.type === 'season' && item.leafCount === '2' && item.viewedLeafCount === '1'; }));
  assert.strictEqual(JSON.stringify(source), before);
});

try {
  global.DOMParser = DOMParser;
  ['recommendationItemsFromXml', 'recommendationRowsFromXml'].forEach(function (method) {
    check(method + ' retains unusual keys and deduplicates actual repeats', function () {
      var children = keys.concat([keys[0]]).map(function (key) {
        return '<Video type="movie" ratingKey="' + key + '" title="' + key + '"/>';
      }).join('');
      var result = HomeModel[method]('<MediaContainer><Hub title="Suggested" hubIdentifier="movie.startwatching">' + children + '</Hub></MediaContainer>', 'http://server', 'token');
      assert.deepStrictEqual(identities(method === 'recommendationRowsFromXml' ? result[0].items : result), keys);
    });
  });
} finally {
  if (originalParser === undefined) { delete global.DOMParser; }
  else { global.DOMParser = originalParser; }
}
assert.deepStrictEqual(failures, [], failures.join('\n'));
console.log('Media identity maps: ' + count + ' behavioral cases passed');
