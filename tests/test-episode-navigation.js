'use strict';

var assert = require('assert');
var EpisodeNavigation = require('../app/episode-navigation');

var seasons = [
  { ratingKey: 'specials', index: 0, title: 'Specials' },
  { ratingKey: 'season-1', index: 1, title: 'Season 1' },
  { ratingKey: 'season-2', index: 2, title: 'Season 2' },
  { ratingKey: 'season-3', index: 3, title: 'Season 3' }
];
var episodeSets = {
  'season-1': [{ ratingKey: 's1e1' }, { ratingKey: 's1e2' }],
  'season-2': [],
  'season-3': [{ ratingKey: 's3e1' }, { ratingKey: 's3e2' }]
};
var resolver = EpisodeNavigation.createResolver(function (season, callback) {
  callback(null, episodeSets[season.ratingKey] || []);
});
var result = null;

resolver.resolve({
  seasons: seasons,
  seasonIndex: 1,
  episodes: episodeSets['season-1'],
  episodeIndex: 0
}, 1, function (error, target) {
  assert.ifError(error);
  result = target;
});
assert.strictEqual(result.seasonIndex, 1, 'next must remain in the current season when possible');
assert.strictEqual(result.episodeIndex, 1, 'next must select the adjacent current-season episode');
assert.strictEqual(result.episode.ratingKey, 's1e2', 'the current-season target must be returned');

result = null;
resolver.resolve({
  seasons: seasons,
  seasonIndex: 1,
  episodes: episodeSets['season-1'],
  episodeIndex: 1
}, 1, function (error, target) {
  assert.ifError(error);
  result = target;
});
assert.strictEqual(result.seasonIndex, 3, 'next must skip an empty regular season');
assert.strictEqual(result.episodeIndex, 0, 'next must select the first episode of the following non-empty season');
assert.strictEqual(result.episode.ratingKey, 's3e1', 'next must return the following season episode');

result = null;
resolver.resolve({
  seasons: seasons,
  seasonIndex: 3,
  episodes: episodeSets['season-3'],
  episodeIndex: 0
}, -1, function (error, target) {
  assert.ifError(error);
  result = target;
});
assert.strictEqual(result.seasonIndex, 1, 'previous must skip an empty regular season');
assert.strictEqual(result.episodeIndex, 1, 'previous must select the final episode of the previous season');
assert.strictEqual(result.episode.ratingKey, 's1e2', 'previous must return the previous season episode');

assert.strictEqual(EpisodeNavigation.canMove({
  seasons: seasons,
  seasonIndex: 1,
  episodes: episodeSets['season-1'],
  episodeIndex: 1
}, 1), true, 'a later regular season must make Next provisionally available');
assert.strictEqual(EpisodeNavigation.canMove({
  seasons: seasons,
  seasonIndex: 1,
  episodes: episodeSets['season-1'],
  episodeIndex: 0
}, -1), false, 'Specials must not make Previous available');
assert.strictEqual(EpisodeNavigation.canMove({
  seasons: seasons,
  seasonIndex: 3,
  episodes: episodeSets['season-3'],
  episodeIndex: 1
}, 1), false, 'the final regular episode must not expose Next');

var noTargetError = null;
resolver.resolve({
  seasons: seasons,
  seasonIndex: 3,
  episodes: episodeSets['season-3'],
  episodeIndex: 1
}, 1, function (error) {
  noTargetError = error;
});
assert.ok(noTargetError, 'resolving beyond the final regular season must report no destination');

var pendingCallbacks = [];
var staleCalls = 0;
var asyncResolver = EpisodeNavigation.createResolver(function (season, callback) {
  pendingCallbacks.push({ season: season, callback: callback });
});
asyncResolver.resolve({
  seasons: seasons,
  seasonIndex: 1,
  episodes: episodeSets['season-1'],
  episodeIndex: 1
}, 1, function () {
  staleCalls += 1;
});
asyncResolver.cancel();
pendingCallbacks[0].callback(null, [{ ratingKey: 'late' }]);
assert.strictEqual(staleCalls, 0, 'cancel must reject a late season response');

var errorResolver = EpisodeNavigation.createResolver(function (season, callback) {
  callback(new Error('network failed'));
});
var loadError = null;
errorResolver.resolve({
  seasons: seasons,
  seasonIndex: 1,
  episodes: episodeSets['season-1'],
  episodeIndex: 1
}, 1, function (error) {
  loadError = error;
});
assert.strictEqual(loadError.message, 'network failed', 'season-loading failures must be propagated');

console.log('Episode navigation checks passed');
