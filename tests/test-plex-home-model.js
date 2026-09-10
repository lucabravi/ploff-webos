'use strict';

var assert = require('assert');
var PlexHomeModel = require('../app/plex-home-model');

assert.strictEqual(typeof PlexHomeModel.homeDefinitions, 'function', 'Plex Home row definitions need a dedicated owner');
assert.strictEqual(typeof PlexHomeModel.recommendationRowsFromXml, 'function', 'Plex recommendation row parsing needs a dedicated owner');
assert.strictEqual(typeof PlexHomeModel.mergeRecommendedItems, 'function', 'Plex recommendation merging needs a dedicated owner');

assert.deepStrictEqual(PlexHomeModel.homeDefinitions([
  { key: '2', title: 'Film', type: 'movie' },
  { key: '4', title: 'Anime', type: 'show' }
], {}), [
  { title: 'Continua a guardare', path: '/hubs/continueWatching/items', kind: 'continue', showLibraryBadge: true },
  { title: 'Recentemente aggiunto in Film', path: '/library/sections/2/recentlyAdded', kind: 'recent', groupRecent: true },
  { title: 'Recentemente aggiunto in Anime', path: '/library/sections/4/recentlyAdded', kind: 'recent', groupRecent: true }
], 'Home definitions must retain Continue Watching and one recent row per compatible library');

assert.strictEqual(PlexHomeModel.recommendationHubPriority('tv.startwatching.4'), 1);
assert.strictEqual(PlexHomeModel.recommendationHubPriority('movie.genre.2.1378'), 2);
assert.strictEqual(PlexHomeModel.recommendationHubPriority('movie.recentlyviewed.2'), 0);

assert.deepStrictEqual(PlexHomeModel.mergeRecommendedItems([
  [{ ratingKey: 'movie-1' }, { ratingKey: 'movie-2' }, { ratingKey: 'shared' }],
  [{ ratingKey: 'show-1' }, { ratingKey: 'shared' }, { ratingKey: 'show-2' }]
], 6).map(function (item) { return item.ratingKey; }), [
  'movie-1', 'show-1', 'movie-2', 'shared', 'show-2'
], 'recommendation merging must alternate libraries and deduplicate Plex rating keys');

var originalParser = global.DOMParser;
try {
  global.DOMParser = require('@xmldom/xmldom').DOMParser;
  var xml = [
    '<MediaContainer>',
    '<Hub title="Lower priority" hubIdentifier="movie.toprated.1">',
    '<Video type="movie" ratingKey="shared" title="Lower duplicate"/>',
    '<Video type="movie" ratingKey="low" title="Low"/>',
    '</Hub>',
    '<Hub title="Excluded" hubIdentifier="movie.recentlyviewed.1">',
    '<Video type="movie" ratingKey="excluded-hub" title="Excluded"/>',
    '</Hub>',
    '<Hub title="First" hubIdentifier="movie.startwatching.1">',
    '<Video type="movie" ratingKey="shared" title="Preferred"/>',
    '<Video type="movie" ratingKey="shared" title="Within-hub duplicate"/>',
    '<Video type="movie" ratingKey="watched" viewCount="1"/>',
    '<Directory type="show" ratingKey="finished" leafCount="4" viewedLeafCount="4"/>',
    '<Directory type="show" ratingKey="partial" title="Partial" leafCount="4" viewedLeafCount="2"/>',
    '<Directory type="show" ratingKey="unknown" title="Unknown" viewedLeafCount="2"/>',
    '<Video type="episode" ratingKey="episode"/>',
    '<Video type="movie" title="Missing key"/>',
    '<Other type="movie" ratingKey="wrong-node"/>',
    '<Group><Video type="movie" ratingKey="nested"/></Group>',
    '</Hub>',
    '<Hub title="Second" hubIdentifier="movie.startwatching.2">',
    '<Video type="movie" ratingKey="shared" title="Other row"/>',
    '<Video type="movie" ratingKey="second" title="Second"/>',
    '</Hub>',
    '<Hub title="Empty" hubIdentifier="movie.startwatching.empty"/>',
    '</MediaContainer>'
  ].join('');
  var flat = PlexHomeModel.recommendationItemsFromXml(xml, 'http://server', 'token');
  var rows = PlexHomeModel.recommendationRowsFromXml(xml, 'http://server', 'token');
  assert.deepStrictEqual(flat.map(function (item) { return [item.ratingKey, item.title]; }), [
    ['shared', 'Preferred'], ['partial', 'Partial'], ['unknown', 'Unknown'], ['second', 'Second'], ['low', 'Low']
  ], 'flat recommendations rank hubs before global deduplication');
  assert.deepStrictEqual(rows.map(function (row) {
    return { title: row.title, identifier: row.identifier, priority: row.priority,
      items: row.items.map(function (item) { return [item.ratingKey, item.title]; }) };
  }), [
    { title: 'First', identifier: 'movie.startwatching.1', priority: 1,
      items: [['shared', 'Preferred'], ['partial', 'Partial'], ['unknown', 'Unknown']] },
    { title: 'Second', identifier: 'movie.startwatching.2', priority: 1,
      items: [['shared', 'Other row'], ['second', 'Second']] },
    { title: 'Lower priority', identifier: 'movie.toprated.1', priority: 5,
      items: [['shared', 'Lower duplicate'], ['low', 'Low']] }
  ], 'row deduplication stays local, with explicit source-order ties');
  ['recommendationItemsFromXml', 'recommendationRowsFromXml'].forEach(function (method) {
    assert.deepStrictEqual(PlexHomeModel[method]('<MediaContainer/>', '', ''), []);
    assert.throws(function () { PlexHomeModel[method]('<parsererror/>', '', ''); }, /Invalid Plex recommendation response/);
  });
} finally {
  if (originalParser === undefined) { delete global.DOMParser; }
  else { global.DOMParser = originalParser; }
}
console.log('Plex Home model checks passed');
