'use strict';

var assert = require('assert');
var MediaProfile = require('../app/media-profile');
var PlexClient = require('../app/plex-client');
var PlexMediaDocument = require('../app/plex-media-document');
var RealPlexFixture = require('./helpers/plex-real-fixture');

function parseFixture(relativePath) {
  return RealPlexFixture.withDomParser(function () {
    return PlexMediaDocument.parse(RealPlexFixture.read(relativePath), 'Invalid real Plex fixture XML');
  });
}

function normalizedTracks(part, streamType) {
  return part.streams.filter(function (stream) {
    return stream.streamType === String(streamType);
  }).map(MediaProfile.trackFromAttributes);
}

(function multiversionFixturePreservesRealVersionOrderAndTechnicalIdentity() {
  var parsed = parseFixture('multiversion/multiversion.xml');
  var profiles = MediaProfile.fromVersions(parsed.video, parsed.groups);

  assert.deepStrictEqual(parsed.groups.map(function (group) { return group.media.id; }),
    ['fixture-media-001', 'fixture-media-002'], 'media versions must remain in Plex response order');
  assert.deepStrictEqual(parsed.groups.map(function (group) { return group.parts[0].part.id; }),
    ['fixture-part-001', 'fixture-part-002'], 'each real version must retain its own playable Part');
  assert.strictEqual(profiles.length, 2, 'the real multiversion item must expose two normalized profiles');
  assert.deepStrictEqual(profiles.map(function (profile) { return profile.videoCodec; }), ['HEVC', 'AV1']);
  assert.deepStrictEqual(profiles.map(function (profile) { return profile.container; }), ['MKV', 'MKV']);
  assert.deepStrictEqual(profiles.map(function (profile) { return profile.resolution; }), ['1080p', '1080p']);
}());

(function multipleAudioFixturePreservesLanguageCodecChannelsAndSelection() {
  var parsed = parseFixture('audio/multiple-audio.xml');
  var tracks = normalizedTracks(parsed.groups[1].parts[0], 2);

  assert.deepStrictEqual(tracks.map(function (track) { return track.id; }), ['fixture-stream-007', 'fixture-stream-008']);
  assert.deepStrictEqual(tracks.map(function (track) { return track.languageTag; }), ['ja', 'en']);
  assert.deepStrictEqual(tracks.map(function (track) { return track.codec; }), ['opus', 'opus']);
  assert.deepStrictEqual(tracks.map(function (track) { return track.channels; }), [2, 2]);
  assert.deepStrictEqual(tracks.map(function (track) { return track.selected; }), [true, false]);
}());

(function forcedSubtitleFixtureKeepsForcedAndRegularTracksDistinct() {
  var parsed = parseFixture('subtitles/forced.xml');
  var tracks = normalizedTracks(parsed.groups[1].parts[0], 3);
  var english = tracks.filter(function (track) { return track.languageTag === 'en'; });

  assert.strictEqual(english.length, 2, 'the real fixture must retain both English subtitle choices');
  assert.deepStrictEqual(english.map(function (track) { return track.forced; }), [false, true]);
  assert.deepStrictEqual(english.map(function (track) { return track.title; }),
    ['Sample Media 1', 'Sample Media 1']);
  assert.deepStrictEqual(english.map(function (track) { return track.index; }), [4, 5]);
}());

(function externalSrtFixtureKeepsExternalSourceSemantics() {
  var parsed = parseFixture('subtitles/external-srt.xml');
  var tracks = normalizedTracks(parsed.groups[0].parts[0], 3);
  var srt = tracks.filter(function (track) { return track.format === 'srt'; })[0];

  assert.ok(srt, 'the real fixture must expose the external SRT track');
  assert.strictEqual(srt.id, 'fixture-stream-023');
  assert.strictEqual(srt.languageTag, 'it');
  assert.strictEqual(srt.codec, 'srt');
  assert.strictEqual(srt.external, true);
  assert.strictEqual(srt.forced, false);
  assert.strictEqual(srt.selected, true);
  assert.strictEqual(srt.key, '/library/streams/fixture-stream-023');
}());

(function loadMetadataPublishesRealExternalAssProfileWithoutSecondRequest() {
  RealPlexFixture.withDomParser(function () {
    var previousXhr = global.XMLHttpRequest;
    var transport = null;
    var detail = null;
    global.XMLHttpRequest = function () {
      transport = this;
      this.open = function () {};
      this.send = function () {};
      this.abort = function () {};
    };
    try {
      PlexClient.loadMetadata({ apiBaseUrl: '/plex-api', token: '' }, 'fixture-video-ass-external', function (error, value) {
        assert.ifError(error);
        detail = value;
      });
      transport.status = 200;
      transport.readyState = 4;
      transport.responseText = RealPlexFixture.read('subtitles/ass-external.xml');
      transport.onreadystatechange();
      assert.ok(detail && detail.mediaProfile, 'real loadMetadata must publish a playable profile from the same Plex response');
      assert.ok(detail.mediaProfile.versions.length >= 1, 'real metadata must preserve every playable Plex version');
      assert.ok(detail.mediaProfile.subtitleTracks.some(function (track) {
        return track.format === 'ass' && track.external && !!track.key;
      }), 'real external ASS metadata must expose its stream key immediately for speculative prefetch');
    } finally {
      global.XMLHttpRequest = previousXhr;
    }
  });
}());

(function externalAndEmbeddedAssFixturesRemainSemanticallyDistinct() {
  var externalParsed = parseFixture('subtitles/ass-external.xml');
  var embeddedParsed = parseFixture('subtitles/ass-embedded.xml');
  var external = normalizedTracks(externalParsed.groups[0].parts[0], 3).filter(function (track) {
    return track.format === 'ass' && track.external;
  })[0];
  var embedded = normalizedTracks(embeddedParsed.groups[0].parts[0], 3).filter(function (track) {
    return track.format === 'ass' && !track.external && track.languageTag === 'it';
  })[0];

  assert.ok(external, 'the real external ASS fixture must expose an external ASS track');
  assert.deepStrictEqual({
    id: external.id, languageTag: external.languageTag, format: external.format,
    external: external.external, selected: external.selected, index: external.index
  }, {
    id: 'fixture-stream-005', languageTag: 'it', format: 'ass',
    external: true, selected: false, index: 0
  });
  assert.ok(embedded, 'the real embedded ASS fixture must expose an embedded Italian ASS track');
  assert.deepStrictEqual({
    id: embedded.id, languageTag: embedded.languageTag, format: embedded.format,
    external: embedded.external, selected: embedded.selected, index: embedded.index, title: embedded.title
  }, {
    id: 'fixture-stream-003', languageTag: 'it', format: 'ass',
    external: false, selected: true, index: 2, title: 'Sample Media 1'
  });
}());

console.log('Real Plex media profile checks passed');
