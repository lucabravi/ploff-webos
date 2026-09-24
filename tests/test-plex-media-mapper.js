'use strict';

var assert = require('assert');
var PlexMediaMapper = require('../app/plex-media-mapper');

assert.strictEqual(typeof PlexMediaMapper.chaptersFromAttributes, 'function',
  'chapter record mapping must be owned by PlexMediaMapper');
assert.strictEqual(typeof PlexMediaMapper.playbackVersionsFromAttributes, 'function',
  'playback version mapping must be owned by PlexMediaMapper');
assert.strictEqual(typeof PlexMediaMapper.markersFromAttributes, 'function',
  'playback marker mapping must be owned by PlexMediaMapper');
assert.strictEqual(typeof PlexMediaMapper.playbackFromAttributes, 'function',
  'playback session record mapping must be owned by PlexMediaMapper');

assert.strictEqual(PlexMediaMapper.mediaFromAttributes, PlexMediaMapper.mediaFromAttributes,
  'PlexClient must expose the pure media mapper without reimplementing card mapping');
assert.strictEqual(PlexMediaMapper.detailFromAttributes, PlexMediaMapper.detailFromAttributes,
  'PlexClient must expose the pure media mapper without reimplementing detail mapping');
assert.strictEqual(PlexMediaMapper.episodeFromAttributes, PlexMediaMapper.episodeFromAttributes,
  'PlexClient must expose the pure media mapper without reimplementing episode mapping');
assert.strictEqual(PlexMediaMapper.preferredSeasonKeyFromAttributes, PlexMediaMapper.preferredSeasonKeyFromAttributes,
  'PlexClient must expose the pure media mapper without reimplementing season selection');

(function hierarchicalWatchedStateRequiresEveryLeafToBeWatched() {
  var partialShow = { type: 'show', ratingKey: 'show-partial', title: 'Partial show', viewCount: '4', leafCount: '12', viewedLeafCount: '11' };
  var completeShow = { type: 'show', ratingKey: 'show-complete', title: 'Complete show', leafCount: '12', viewedLeafCount: '12' };
  var partialSeason = { type: 'season', ratingKey: 'season-partial', parentTitle: 'Show', index: '1', viewCount: '8', leafCount: '10', viewedLeafCount: '9' };

  assert.notStrictEqual(PlexMediaMapper.mediaFromAttributes(partialShow, '/plex-api', '').viewed, true,
    'a partially watched show must not render the watched checkmark merely because Plex reports viewCount');
  assert.strictEqual(PlexMediaMapper.mediaFromAttributes(completeShow, '/plex-api', '').viewed, true,
    'a show whose watched leaves equal its total leaves must render as watched');
  assert.notStrictEqual(PlexMediaMapper.mediaFromAttributes(partialSeason, '/plex-api', '').viewed, true,
    'a partially watched season must not render the watched checkmark merely because Plex reports viewCount');
  assert.strictEqual(PlexMediaMapper.detailFromAttributes(partialShow, '/plex-api', '').viewed, false,
    'Detail must use the same completion semantics as Library cards for shows');
  assert.strictEqual(PlexMediaMapper.detailFromAttributes(completeShow, '/plex-api', '').viewed, true,
    'Detail must consider a fully watched show watched even when no show-level viewCount is present');
}());

(function mapsEpisodeCardsAndProgressWithoutTransportState() {
  var item = PlexMediaMapper.mediaFromAttributes({
    type: 'episode', ratingKey: '42', grandparentRatingKey: 'show-1', grandparentTitle: 'Show',
    parentTitle: 'Season 2', parentIndex: '2', index: '3', title: 'Episode',
    duration: '100000', viewOffset: '25000', grandparentThumb: '/thumb', grandparentArt: '/art',
    grandparentTheme: '/theme'
  }, '/plex-api', 'token');
  assert.strictEqual(item.title, 'Show');
  assert.strictEqual(item.seasonIndex, 2);
  assert.strictEqual(item.episodeIndex, 3);
  assert.strictEqual(item.progress, 25);
  assert.strictEqual(item.themeKey, 'show:show-1');
  assert.ok(/X-Plex-Token=token/.test(item.image));
}());

(function missingEpisodeTitleKeepsLocalizationMetadata() {
  var episode = PlexMediaMapper.episodeFromAttributes({ ratingKey: 'episode-7', index: '7' }, '/plex-api', '', '', 0);
  assert.strictEqual(episode.title, '', 'episode transport mapping must not bake an Italian fallback title into the model');
  assert.strictEqual(episode.titleKey, 'media.episodeNumber', 'missing episode titles must retain a localizable presentation key');
  assert.deepStrictEqual(episode.titleParameters, { number: 7 }, 'missing episode titles must retain the episode number for localization');
}());

(function missingSeasonNamesKeepLocalizationMetadata() {
  var episodeDetail = PlexMediaMapper.detailFromAttributes({
    type: 'episode', ratingKey: 'episode-3', grandparentTitle: 'Show', parentIndex: '2', index: '3', title: 'Episode'
  }, '/plex-api', '');
  var seasonDetail = PlexMediaMapper.detailFromAttributes({
    type: 'season', ratingKey: 'season-2', parentTitle: 'Show', index: '2'
  }, '/plex-api', '');
  var season = PlexMediaMapper.seasonFromAttributes({ ratingKey: 'season-2', index: '2' }, '/plex-api', '', 'season-2');

  assert.strictEqual(episodeDetail.seasonTitleKey, 'media.season',
    'an episode with no Plex season title must retain a localizable season-prefix key');
  assert.deepStrictEqual(episodeDetail.seasonTitleParameters, { number: 2 },
    'an episode fallback season label must retain its season number');
  assert.strictEqual(seasonDetail.subtitleKey, 'media.season',
    'a season Detail with no Plex title must retain a localizable subtitle key');
  assert.deepStrictEqual(seasonDetail.subtitleParameters, { number: 2 },
    'a season Detail fallback subtitle must retain its season number');
  assert.strictEqual(season.titleKey, 'media.season',
    'a season tab with no Plex title must retain a localizable title key');
  assert.deepStrictEqual(season.titleParameters, { number: 2 },
    'a season tab fallback title must retain its season number');
}());

(function groupsOnlyAdjacentRecentRunsOfThreeOrMore() {
  var pairSource = [
    { type: 'episode', ratingKey: 'e1', parentRatingKey: 'season-1', grandparentTitle: 'Show', parentTitle: 'Season 1', parentIndex: '1', index: '1', title: 'Spoiler one', addedAt: '300' },
    { type: 'episode', ratingKey: 'e2', parentRatingKey: 'season-1', grandparentTitle: 'Show', parentTitle: 'Season 1', parentIndex: '1', index: '2', title: 'Spoiler two', viewCount: '1' }
  ];
  var before = JSON.stringify(pairSource);
  var pair = PlexMediaMapper.groupRecentAttributes(pairSource);
  var grouped = PlexMediaMapper.groupRecentAttributes(pairSource.concat([
    { type: 'episode', ratingKey: 'e3', parentRatingKey: 'season-1', grandparentTitle: 'Show', parentTitle: 'Season 1', parentIndex: '1', index: '7', title: 'Spoiler three' }
  ]));
  var interrupted = PlexMediaMapper.groupRecentAttributes([
    pairSource[0], pairSource[1],
    { type: 'movie', ratingKey: 'm1', title: 'Movie' },
    { type: 'episode', ratingKey: 'e3', parentRatingKey: 'season-1', grandparentTitle: 'Show', parentTitle: 'Season 1', parentIndex: '1', index: '3' }
  ]);
  var twoRuns = PlexMediaMapper.groupRecentAttributes([
    pairSource[0], pairSource[1],
    { type: 'episode', ratingKey: 'e3', parentRatingKey: 'season-1', grandparentTitle: 'Show', parentTitle: 'Season 1', parentIndex: '1', index: '3' },
    { type: 'movie', ratingKey: 'm1', title: 'Movie' },
    { type: 'episode', ratingKey: 'e4', parentRatingKey: 'season-1', grandparentTitle: 'Show', parentTitle: 'Season 1', parentIndex: '1', index: '4' },
    { type: 'episode', ratingKey: 'e5', parentRatingKey: 'season-1', grandparentTitle: 'Show', parentTitle: 'Season 1', parentIndex: '1', index: '5' },
    { type: 'episode', ratingKey: 'e6', parentRatingKey: 'season-1', grandparentTitle: 'Show', parentTitle: 'Season 1', parentIndex: '1', index: '6' }
  ]);

  assert.strictEqual(pair.length, 2, 'two adjacent recent episodes must remain two cards');
  assert.ok(pair.every(function (item) { return item.type === 'episode' && item.recentlyAdded === '1'; }),
    'ungrouped recent episodes must be marked for spoiler-safe presentation');
  assert.strictEqual(JSON.stringify(pairSource), before, 'recent grouping must not mutate Plex source attributes');
  assert.strictEqual(grouped.length, 1, 'three adjacent episodes from one season must compact into one card');
  assert.strictEqual(grouped[0].type, 'season');
  assert.strictEqual(grouped[0].leafCount, '3');
  assert.strictEqual(grouped[0].viewedLeafCount, '1');
  assert.strictEqual(grouped[0].recentlyAddedCount, '3');
  assert.strictEqual(grouped[0].addedAt, '300', 'a compact recent run must retain the newest feed timestamp for cross-server ordering');
  assert.strictEqual(interrupted.length, 4, 'another feed item must break recent grouping even when the season repeats later');
  assert.deepStrictEqual(twoRuns.map(function (item) { return item.type; }), ['season', 'movie', 'season'],
    'separate adjacent runs of the same season must remain separate groups');
}());

(function recentCardsHideEpisodeTitlesAndLabelGroupedRunsAsNew() {
  var pair = PlexMediaMapper.groupRecentAttributes([
    { type: 'episode', ratingKey: 'e1', parentRatingKey: 'season-1', grandparentTitle: 'Show', parentTitle: 'Season 1', parentIndex: '1', index: '4', title: 'Major spoiler' },
    { type: 'episode', ratingKey: 'e2', parentRatingKey: 'season-1', grandparentTitle: 'Show', parentTitle: 'Season 1', parentIndex: '1', index: '8', title: 'Another spoiler' }
  ]);
  var singleCard = PlexMediaMapper.mediaFromAttributes(pair[0], '/plex-api', '');
  var groupedAttributes = PlexMediaMapper.groupRecentAttributes([
    pair[0], pair[1],
    { type: 'episode', ratingKey: 'e3', parentRatingKey: 'season-1', grandparentTitle: 'Show', parentTitle: 'Season 1', parentIndex: '1', index: '11', title: 'Final spoiler' }
  ])[0];
  var groupCard = PlexMediaMapper.mediaFromAttributes(groupedAttributes, '/plex-api', '');

  assert.strictEqual(singleCard.detailKey, 'media.episodeNumber');
  assert.deepStrictEqual(singleCard.detailParameters, { number: 4 });
  assert.strictEqual(singleCard.detail, 'Episode 4');
  assert.strictEqual(singleCard.detail.indexOf('Major spoiler'), -1, 'recent cards must not expose episode titles');
  assert.strictEqual(groupCard.detailKey, 'media.newEpisodeCount');
  assert.deepStrictEqual(groupCard.detailParameters, { count: 3 });
  assert.strictEqual(groupCard.detail, '3 new episodes');
}());

(function choosesAnUnwatchedRegularSeasonWhenRequestedSeasonIsMissing() {
  assert.strictEqual(PlexMediaMapper.preferredSeasonKeyFromAttributes([
    { ratingKey: 'specials', index: '0', leafCount: '1', viewedLeafCount: '0' },
    { ratingKey: 'season-1', index: '1', leafCount: '10', viewedLeafCount: '10' },
    { ratingKey: 'season-2', index: '2', leafCount: '8', viewedLeafCount: '3' }
  ], 'missing'), 'season-2');
}());

(function mapsDetailIdentityAndWatchlistIdentity() {
  var detail = PlexMediaMapper.detailFromAttributes({
    type: 'episode', ratingKey: 'ep-1', grandparentRatingKey: 'show-1', parentRatingKey: 'season-1',
    grandparentGuid: 'plex://show/1', grandparentTitle: 'Show', parentTitle: 'Season 1',
    parentIndex: '1', index: '2', title: 'Episode', duration: '120000'
  }, '/plex-api', '');
  assert.strictEqual(detail.showRatingKey, 'show-1');
  assert.strictEqual(detail.seasonRatingKey, 'season-1');
  assert.strictEqual(detail.watchlistGuid, 'plex://show/1');
}());


(function characterizesCompleteMediaCardShapes() {
  var cases = [
    {
      name: 'movie',
      attributes: {
        type: 'movie', ratingKey: 'm1', title: 'Movie', year: '2024', genre: 'Drama',
        summary: 'Summary', tagline: 'Tag', contentRating: 'PG', audienceRating: '8.2',
        duration: '120000', viewOffset: '30000', viewCount: '1', thumb: '/movie-thumb',
        art: '/movie-art', theme: '/movie-theme', librarySectionTitle: 'Movies', guid: 'plex://movie/1'
      },
      expected: {
        title: 'Movie', meta: 'Movie - 2024', image: '/plex-api/movie-thumb?X-Plex-Token=token',
        art: '/plex-api/movie-art?X-Plex-Token=token', metaKey: 'media.movieWithYear',
        metaParameters: { year: '2024' }, libraryTitle: 'Movies', year: 2024, genre: 'Drama',
        summary: 'Summary', tagline: 'Tag', contentRating: 'PG', guid: 'plex://movie/1',
        ratingKey: 'm1', type: 'movie', themeLookupKey: 'movie:m1', rating: 8.2, viewed: true,
        duration: 120000, viewOffset: 30000, progress: 25, themeKey: 'movie:m1',
        themeUrl: '/plex-api/movie-theme?X-Plex-Token=token'
      }
    },
    {
      name: 'episode',
      attributes: {
        type: 'episode', ratingKey: 'e1', grandparentRatingKey: 'show1', grandparentTitle: 'Show',
        parentTitle: 'Season 2', parentIndex: '2', index: '3', title: 'Episode', duration: '100000',
        viewOffset: '25000', grandparentThumb: '/show-thumb', parentThumb: '/season-thumb',
        thumb: '/episode-thumb', grandparentArt: '/show-art', art: '/episode-art',
        grandparentTheme: '/show-theme', librarySectionTitle: 'TV'
      },
      expected: {
        title: 'Show', meta: 'Season 2', image: '/plex-api/show-thumb?X-Plex-Token=token',
        art: '/plex-api/show-art?X-Plex-Token=token', metaKey: 'media.season',
        metaParameters: { number: 2 }, libraryTitle: 'TV', ratingKey: 'e1', type: 'episode',
        themeLookupKey: 'show:show1', detail: 'E03 - Episode', seasonIndex: 2, episodeIndex: 3,
        duration: 100000, viewOffset: 25000, progress: 25, themeKey: 'show:show1',
        themeUrl: '/plex-api/show-theme?X-Plex-Token=token'
      }
    },
    {
      name: 'season',
      attributes: {
        type: 'season', ratingKey: 's2', parentRatingKey: 'show1', parentTitle: 'Show', index: '2',
        leafCount: '10', viewedLeafCount: '10', thumb: '/season-thumb', art: '/season-art',
        parentTheme: '/show-theme'
      },
      expected: {
        title: 'Show', meta: 'Season 2', image: '/plex-api/season-thumb?X-Plex-Token=token',
        art: '/plex-api/season-art?X-Plex-Token=token', metaKey: 'media.season',
        metaParameters: { number: 2 }, ratingKey: 's2', type: 'season', themeLookupKey: 'show:show1',
        detail: '10 episodes', detailKey: 'media.episodeCount', detailParameters: { count: 10 },
        viewed: true, themeKey: 'show:show1', themeUrl: '/plex-api/show-theme?X-Plex-Token=token'
      }
    },
    {
      name: 'show',
      attributes: { type: 'show', ratingKey: 'show1', title: 'Show', childCount: '4', thumb: '/show-thumb', art: '/show-art', theme: '/show-theme' },
      expected: {
        title: 'Show', meta: 'TV Shows', image: '/plex-api/show-thumb?X-Plex-Token=token',
        art: '/plex-api/show-art?X-Plex-Token=token', metaKey: 'media.show', seasonCount: 4,
        ratingKey: 'show1', type: 'show', themeLookupKey: 'show:show1', themeKey: 'show:show1',
        themeUrl: '/plex-api/show-theme?X-Plex-Token=token'
      }
    },
    {
      name: 'minimal',
      attributes: {},
      expected: { title: 'Untitled', meta: 'Media', image: '', art: '', titleKey: 'media.untitled' }
    },
    {
      name: 'localized-and-viewed',
      attributes: {
        type: 'movie', ratingKey: 'm2', year: '0', title: '', librarySectionTitle: 'Cinema',
        contentRating: 'T', rating: '7.1', leafCount: '2', viewedLeafCount: '2', duration: '0',
        viewOffset: '0', art: 'https://cdn.example/art.jpg'
      },
      expected: {
        title: 'Untitled', meta: 'Movie - 0', image: 'https://cdn.example/art.jpg',
        art: 'https://cdn.example/art.jpg', titleKey: 'media.untitled', metaKey: 'media.movieWithYear',
        metaParameters: { year: '0' }, libraryTitle: 'Cinema', year: '0', contentRating: 'T',
        ratingKey: 'm2', type: 'movie', themeLookupKey: 'movie:m2', rating: 7.1, viewed: true
      }
    }
  ];

  cases.forEach(function (fixture) {
    assert.deepStrictEqual(
      PlexMediaMapper.mediaFromAttributes(fixture.attributes, '/plex-api', 'token'),
      fixture.expected,
      fixture.name + ' media mapping must remain byte-for-byte equivalent in data shape'
    );
  });
}());



console.log('Plex media mapper checks passed');

(function preservesMultiServerRoutingAndActivityMetadata() {
  var item = PlexMediaMapper.mediaFromAttributes({
    type: 'episode', ratingKey: 'ep-source', title: 'Episode', librarySectionID: '77',
    lastViewedAt: '1234', updatedAt: '1200', addedAt: '1100'
  }, '/plex-api', '');
  assert.strictEqual(item.librarySectionID, '77');
  assert.strictEqual(item.lastViewedAt, 1234);
  assert.strictEqual(item.updatedAt, 1200);
  assert.strictEqual(item.addedAt, 1100);
}());
