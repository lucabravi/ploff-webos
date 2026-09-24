'use strict';

var assert = require('assert');
var MediaProfile = require('../app/media-profile');
var PlexMediaDocument = require('../app/plex-media-document');
var SubtitleSeriesOffset = require('../app/subtitle-series-offset');
var RealPlexFixture = require('./helpers/plex-real-fixture');

function dialoghiTrack(relativePath) {
  return RealPlexFixture.withDomParser(function () {
    var parsed = PlexMediaDocument.parse(RealPlexFixture.read(relativePath), 'Invalid real Plex fixture XML');
    var subtitles = parsed.groups[1].parts[0].streams.filter(function (stream) {
      return stream.streamType === '3';
    }).map(MediaProfile.trackFromAttributes);
    return subtitles.filter(function (track) { return track.title === 'Dialoghi'; })[0];
  });
}

(function sameSeasonPreferenceMatchesEquivalentAssTracksInsteadOfPlexStreamIds() {
  var first = dialoghiTrack('season-subtitle-cascade/episode-001.xml');
  var second = dialoghiTrack('season-subtitle-cascade/episode-002.xml');
  var third = dialoghiTrack('season-subtitle-cascade/episode-003.xml');
  var values = {};
  var storage = {
    getItem: function (key) { return values[key] || null; },
    setItem: function (key, value) { values[key] = value; }
  };
  var detail = { type: 'episode', ratingKey: 'episode-001', parentRatingKey: 'season-cascade' };

  assert.deepStrictEqual([first.id, second.id, third.id],
    ['fixture-stream-009', 'fixture-stream-049', 'fixture-stream-038'],
    'the real season fixtures must keep distinct Plex stream IDs');
  assert.deepStrictEqual(SubtitleSeriesOffset.signature(first), {
    language: 'it', format: 'ass', external: false, title: 'dialoghi', forced: false, index: 3
  }, 'the season preference must be represented by stable subtitle semantics');
  assert.strictEqual(SubtitleSeriesOffset.saveProfile(storage, 'server|profile', detail, 'season', first, { offsetMs: 425 }), true);
  assert.strictEqual(SubtitleSeriesOffset.resolve(storage, 'server|profile', detail, second).offsetMs, 425,
    'episode 2 must inherit season presentation through its semantically equivalent Plex stream');
  assert.strictEqual(SubtitleSeriesOffset.resolve(storage, 'server|profile', detail, third).offsetMs, 425,
    'episode 3 must inherit the same season presentation despite a different Plex stream ID');
}());

console.log('Real Plex subtitle cascade checks passed');
