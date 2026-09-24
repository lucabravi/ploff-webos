'use strict';

var assert = require('assert');
var fixture = require('./helpers/plex-real-fixture');
var PlexMediaDocument = require('../app/plex-media-document');
var PlexMediaMapper = require('../app/plex-media-mapper');
var Provider = require('../app/coordinator/plex-container-queue-provider');
var Contract = require('../app/coordinator/queue-sequence-contract');
var Cache = require('../app/coordinator/bounded-queue-cache');

function parse(relativePath) {
  return fixture.withDomParser(function () {
    return PlexMediaDocument.parseAttributes(fixture.read(relativePath));
  });
}

(function preservesRealSeriesHierarchyAndPlexSeasonOrder() {
  var series = parse('hierarchy/series.xml');
  var seasonRecords = parse('hierarchy/series-seasons.xml');
  var mappedSeries = PlexMediaMapper.mediaFromAttributes(series[0], '/plex-api', '');
  var realSeasons = seasonRecords.filter(function (attributes) { return !!attributes.ratingKey; });
  var selectedKey = PlexMediaMapper.preferredSeasonKeyFromAttributes(realSeasons, '');
  var mappedSeasons = realSeasons.map(function (attributes) {
    return PlexMediaMapper.seasonFromAttributes(attributes, '/plex-api', '', selectedKey);
  });

  assert.strictEqual(series.length, 1);
  assert.deepStrictEqual({
    ratingKey: mappedSeries.ratingKey,
    type: mappedSeries.type,
    title: mappedSeries.title,
    seasonCount: mappedSeries.seasonCount
  }, {
    ratingKey: 'fixture-id-002',
    type: 'show',
    title: 'Sample Series',
    seasonCount: 2
  });
  assert.strictEqual(seasonRecords.length, 3, 'the Plex season response must retain all three records');
  assert.deepStrictEqual(seasonRecords.map(function (attributes) { return attributes.title; }), [
    'All episodes',
    'Season 1',
    'Season 2'
  ], 'the special all-episodes record and regular seasons must remain in Plex order');
  assert.deepStrictEqual(mappedSeasons.map(function (season) { return season.ratingKey; }), [
    'fixture-id-142',
    'fixture-id-143'
  ], 'regular seasons must retain Plex order after the production filter');
  assert.strictEqual(mappedSeasons[0].selected, true, 'the first unwatched regular season must remain the preferred season');
}());

(function preservesAllTwentyRealSeasonEpisodesInPlexOrder() {
  var records = parse('hierarchy/season-01-episodes.xml');
  var episodes = records.map(function (attributes) {
    return PlexMediaMapper.episodeFromAttributes(attributes, '/plex-api', '', '', 2022);
  });
  var expectedRatingKeys = [
    'fixture-id-144', 'fixture-id-149', 'fixture-id-154', 'fixture-id-159', 'fixture-id-164',
    'fixture-id-169', 'fixture-id-174', 'fixture-id-179', 'fixture-id-184', 'fixture-id-189',
    'fixture-id-194', 'fixture-id-199', 'fixture-id-204', 'fixture-id-209', 'fixture-id-214',
    'fixture-id-219', 'fixture-id-224', 'fixture-id-229', 'fixture-id-234', 'fixture-id-239'
  ];

  assert.strictEqual(episodes.length, 20);
  assert.deepStrictEqual(episodes.map(function (episode) { return episode.ratingKey; }), expectedRatingKeys);
  assert.deepStrictEqual(episodes.map(function (episode) { return episode.episodeIndex; }), [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20
  ]);
  assert.ok(episodes.every(function (episode) { return episode.seasonIndex === 1 && episode.type === 'episode'; }));
}());

(function preservesRealCollectionMemberOrder() {
  var records = parse('collections/collection-order.xml');
  var items = records.map(function (attributes) {
    return PlexMediaMapper.mediaFromAttributes(attributes, '/plex-api', '');
  });

  assert.strictEqual(items.length, 4);
  assert.deepStrictEqual(items.map(function (item) { return item.ratingKey; }), [
    'fixture-id-244',
    'fixture-id-248',
    'fixture-id-251',
    'fixture-id-254'
  ]);
  assert.ok(items.every(function (item) { return item.type === 'movie'; }));
}());

(function preservesRealPlaylistOrderTypesAndOccurrenceIdentity() {
  var records = parse('playlists/playlist-order.xml');
  var items = records.map(function (attributes) {
    return PlexMediaMapper.mediaFromAttributes(attributes, '/plex-api', '');
  });
  var expectedRatingKeys = [
    'fixture-id-258', 'fixture-id-263', 'fixture-id-266', 'fixture-id-269', 'fixture-id-272',
    'fixture-id-275', 'fixture-id-278', 'fixture-id-281', 'fixture-id-284', 'fixture-id-287',
    'fixture-id-290', 'fixture-id-293', 'fixture-id-296', 'fixture-id-300', 'fixture-id-303',
    'fixture-id-306', 'fixture-id-309', 'fixture-id-312', 'fixture-id-315', 'fixture-id-318',
    'fixture-id-321', 'fixture-id-324', 'fixture-id-327', 'fixture-id-330', 'fixture-id-333',
    'fixture-id-337', 'fixture-id-340'
  ];
  var provider = Provider.create({
    QueueSequenceContract: Contract,
    BoundedQueueCache: Cache,
    pageSize: 7,
    maxPages: 5,
    maxRecords: 40,
    loadPage: function (request, callback) {
      callback(null, {
        total: items.length,
        items: items.slice(request.start, request.start + request.size)
      });
    }
  });
  var windowResult = null;

  assert.strictEqual(records.length, 27);
  assert.deepStrictEqual(records.map(function (attributes) { return attributes.playlistItemID; }), [
    '2638', '2639', '2640', '2641', '2642', '2643', '2644', '2645', '2646',
    '2647', '2648', '2649', '2650', '2651', '2652', '2653', '2654', '2655',
    '2656', '2657', '2658', '2659', '2660', '2661', '2670', '2662', '2666'
  ], 'playlist item IDs must not be sorted or normalized away from Plex order');
  assert.deepStrictEqual(items.map(function (item) { return item.ratingKey; }), expectedRatingKeys);
  assert.deepStrictEqual(items.map(function (item) { return item.type; }), [
    'episode', 'episode', 'episode', 'episode', 'episode', 'episode', 'episode', 'episode',
    'episode', 'episode', 'episode', 'episode', 'episode', 'episode', 'episode', 'episode',
    'episode', 'episode', 'episode', 'episode', 'episode', 'episode', 'episode', 'episode',
    'movie', 'movie', 'movie'
  ], 'mixed playlist media types must remain mixed in their original positions');

  provider.open({ kind: 'playlist', id: 'fixture-id-257', title: 'Sample Playlist', total: 27 });
  provider.window(0, 27, function (error, result) {
    assert.ifError(error);
    windowResult = result;
  });
  assert.ok(windowResult);
  assert.strictEqual(windowResult.items.length, 27);
  assert.deepStrictEqual(windowResult.items.map(function (entry) { return entry.absoluteIndex; }), [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26
  ]);
  assert.deepStrictEqual(windowResult.items.map(function (entry) { return entry.item.ratingKey; }), expectedRatingKeys);
  assert.deepStrictEqual(windowResult.items.map(function (entry) { return entry.occurrenceId; }), expectedRatingKeys.map(function (ratingKey, index) {
    return 'playlist-fixture-id-257:' + index + ':' + ratingKey;
  }), 'queue occurrence identity must include the absolute Plex position');
  assert.strictEqual(new Set(windowResult.items.map(function (entry) { return entry.occurrenceId; })).size, 27,
    'every real playlist occurrence must retain its own identity');
  provider.destroy();
}());
