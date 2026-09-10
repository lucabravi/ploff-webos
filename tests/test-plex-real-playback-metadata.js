'use strict';

var assert = require('assert');
var fixture = require('./helpers/plex-real-fixture');
var PlexClient = require('../app/plex-client');
var PlexMediaDocument = require('../app/plex-media-document');

(function preservesRealChaptersCreditsMarkersAndMediaTree() {
  var previousXhr = global.XMLHttpRequest;
  var request = null;
  var playback = null;
  var xmlText = fixture.read('playback/chapters-and-markers.xml');

  try {
    global.XMLHttpRequest = function () {
      request = this;
      this.open = function () {};
      this.setRequestHeader = function () {};
      this.send = function () {};
      this.abort = function () {};
    };

    fixture.withDomParser(function () {
      var parsed = PlexMediaDocument.parse(xmlText, 'Invalid Plex playback fixture');

      assert.deepStrictEqual(parsed.groups.map(function (group) {
        return {
          mediaId: group.media.id,
          parts: group.parts.map(function (part) {
            return {
              partId: part.part.id,
              streamIds: part.streams.map(function (stream) { return stream.id; })
            };
          })
        };
      }), [
        {
          mediaId: 'fixture-id-145',
          parts: [{
            partId: 'fixture-id-146',
            streamIds: ['fixture-id-377', 'fixture-id-378', 'fixture-id-379', 'fixture-id-380', 'fixture-id-381']
          }]
        },
        {
          mediaId: 'fixture-id-147',
          parts: [{
            partId: 'fixture-id-148',
            streamIds: ['fixture-id-382', 'fixture-id-383', 'fixture-id-384', 'fixture-id-385', 'fixture-id-386', 'fixture-id-387']
          }]
        }
      ], 'chapters and markers must coexist with the exact real Media/Part/Stream tree');

      PlexClient.loadPlayback({ apiBaseUrl: '/plex-api', token: '' }, 'fixture-id-144', 'fixture-session', function (error, value) {
        assert.ifError(error);
        playback = value;
      });
      assert.ok(request, 'loadPlayback must issue one offline-stubbed metadata request');
      request.status = 200;
      request.readyState = 4;
      request.responseText = xmlText;
      request.onreadystatechange();
    });
  } finally {
    global.XMLHttpRequest = previousXhr;
  }

  assert.ok(playback);
  assert.strictEqual(playback.chapters.length, 5);
  assert.deepStrictEqual(playback.chapters.map(function (chapter) {
    return [chapter.key, chapter.index, chapter.title, chapter.startTimeOffset, chapter.endTimeOffset];
  }), [
    ['fixture-id-398', 1, 'Part A', 0, 152010],
    ['fixture-id-399', 2, 'Part B', 152010, 1012580],
    ['fixture-id-400', 3, 'ED', 1012580, 1074100],
    ['fixture-id-401', 4, 'Outro', 1074100, 1329930],
    ['fixture-id-402', 5, 'OP', 1329930, 1431510]
  ]);
  assert.deepStrictEqual(playback.chapters.map(function (chapter) { return chapter.thumb; }), [
    '/plex-api/library/media/19187/chapterImages/1',
    '/plex-api/library/media/19187/chapterImages/2',
    '/plex-api/library/media/19187/chapterImages/3',
    '/plex-api/library/media/19187/chapterImages/4',
    '/plex-api/library/media/19187/chapterImages/5'
  ], 'real chapter artwork references must remain aligned with chapter order');

  assert.strictEqual(playback.markers.length, 2);
  assert.deepStrictEqual(playback.markers.map(function (marker) {
    return [marker.type, marker.startTimeOffset, marker.endTimeOffset, marker.final];
  }), [
    ['credits', 1334358, 1368358, false],
    ['credits', 1416358, 1431509, true]
  ], 'real credits markers must retain timestamp order and final-marker semantics');
}());
