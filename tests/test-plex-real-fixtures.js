'use strict';

var assert = require('assert');
var PlexMediaDocument = require('../app/plex-media-document');
var RealPlexFixture = require('./helpers/plex-real-fixture');

function parseFixture(relativePath) {
  return RealPlexFixture.withDomParser(function () {
    return PlexMediaDocument.parse(RealPlexFixture.read(relativePath), 'Invalid real Plex fixture XML');
  });
}

(function noSubtitleFixtureKeepsTheRealMediaTreeWithoutInventingSubtitleStreams() {
  var parsed = parseFixture('edge/no-subtitles.xml');
  var streams = parsed.groups[0].parts[0].streams;

  assert.strictEqual(parsed.video.ratingKey, 'fixture-id-343');
  assert.strictEqual(parsed.groups.length, 1, 'the real no-subtitles fixture must expose exactly one Media');
  assert.strictEqual(parsed.groups[0].parts.length, 1, 'the real no-subtitles fixture must expose exactly one Part');
  assert.deepStrictEqual(streams.map(function (stream) { return stream.streamType; }), ['1', '2'],
    'production parsing must not invent subtitle streams when Plex returned none');
}());

(function multipartFixturePreservesPartAndStreamOrder() {
  var parsed = parseFixture('multipart/multipart.xml');
  var parts = parsed.groups[0].parts;

  assert.strictEqual(parsed.video.ratingKey, 'fixture-rating-004');
  assert.strictEqual(parsed.groups.length, 1, 'the real multipart fixture must expose one Media version');
  assert.deepStrictEqual(parts.map(function (entry) { return entry.part.id; }), ['fixture-part-003', 'fixture-part-004'],
    'multipart parsing must preserve Plex Part order');
  assert.deepStrictEqual(parts.map(function (entry) {
    return entry.streams.map(function (stream) { return stream.id; });
  }), [
    ['fixture-stream-012', 'fixture-stream-013', 'fixture-stream-014', 'fixture-stream-015'],
    ['fixture-stream-016', 'fixture-stream-017', 'fixture-stream-018', 'fixture-stream-019']
  ], 'each Part must retain its own streams in Plex order');
}());

console.log('Real Plex fixture media-document checks passed');
