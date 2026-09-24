'use strict';

var assert = require('assert');
var fixture = require('./helpers/plex-real-fixture');
var PlexClient = require('../app/plex-client');

function withRequest(xmlText, callback) {
  var previousXhr = global.XMLHttpRequest;
  var requests = [];
  global.XMLHttpRequest = function () {
    requests.push(this);
    this.open = function (method, url) { this.method = method; this.url = url; };
    this.send = function () {};
    this.abort = function () { this.aborted = true; };
  };
  try {
    callback(requests, function respond(index) {
      var request = requests[index];
      request.status = 200;
      request.readyState = 4;
      request.responseText = xmlText;
      request.onreadystatechange();
    });
  } finally {
    global.XMLHttpRequest = previousXhr;
  }
}

fixture.withDomParser(function () {
  withRequest(fixture.read('extras/parent.xml'), function (requests, respond) {
    var detail = null;
    PlexClient.loadMetadata({ apiBaseUrl: '/plex-api', token: '' }, 'fixture-rating-010', function (error, value) {
      assert.ifError(error);
      detail = value;
    });
    assert.strictEqual(requests.length, 1, 'extended metadata must reuse the normal detail request');
    respond(0);
    assert.ok(detail, 'the real detail response must map successfully');
    assert.deepStrictEqual(detail.genres, ['Fantasy', 'Animazione', 'Action', 'Adventure', 'Thriller', 'Anime', 'Dramma', 'Horror'], 'all direct Plex Genre tags must be retained in Plex order');
    assert.deepStrictEqual(detail.directors, ['Sample Crew'], 'director tags must map without another request');
    assert.strictEqual(detail.cast.length, 48, 'the real movie cast must remain available without rendering all cards');
    assert.deepStrictEqual(detail.cast.slice(0, 2).map(function (person) {
      return [person.name, person.role, person.thumb];
    }), [
      ['Performer 1', 'Character 1', 'https://plex.example.test/people/fixture-person-2.jpg'],
      ['Performer 2', 'Character 2', 'https://plex.example.test/people/fixture-person-3.jpg']
    ], 'cast identity, role, image and Plex ordering must be preserved');
  });
});

assert.strictEqual(typeof PlexClient.loadExtras, 'function', 'PlexClient must expose lazy extras loading for Detail');

fixture.withDomParser(function () {
  withRequest(fixture.read('extras/extras.xml'), function (requests, respond) {
    var extras = null;
    var handle = PlexClient.loadExtras({ apiBaseUrl: '/plex-api', token: '' }, 'fixture-rating-010', function (error, value) {
      assert.ifError(error);
      extras = value;
    });
    assert.ok(handle && typeof handle.abort === 'function', 'lazy extras loading must remain cancellable');
    assert.strictEqual(requests.length, 1, 'entering extended detail must start exactly one extras request');
    assert.ok(/\/library\/metadata\/fixture-rating-010\/extras(?:\?|$)/.test(requests[0].url), 'extras must use the Plex extras endpoint for the title');
    respond(0);
    assert.deepStrictEqual(extras.map(function (item) {
      return [item.ratingKey, item.title, item.subtype, item.duration];
    }), [
      ['fixture-rating-009', 'Sample Extra 1', 'trailer', 133000],
      ['fixture-rating-011', 'Sample Extra 2', 'trailer', 30000]
    ], 'extras must preserve Plex ordering, identity, subtype and duration');
  });
});

fixture.withDomParser(function () {
  withRequest(fixture.read('extras/extras.xml'), function (requests, respond) {
    var playback = null;
    PlexClient.loadPlayback({ apiBaseUrl: '/plex-api', token: '' }, 'fixture-rating-009', 'extra-fixture-session', function (error, value) {
      assert.ifError(error);
      playback = value;
    });
    assert.strictEqual(requests.length, 1, 'playing a real Plex extra must reuse its metadata endpoint without a parent reload');
    assert.ok(/\/library\/metadata\/fixture-rating-009(?:\?|$)/.test(requests[0].url), 'extra playback must resolve the selected extra ratingKey');
    respond(0);
    assert.ok(playback, 'the real Plex trailer fixture must map to a playable item');
    assert.strictEqual(playback.ratingKey, 'fixture-rating-009', 'extra playback must preserve the selected trailer identity');
    assert.strictEqual(playback.duration, 133000, 'extra playback must preserve trailer duration');
    assert.ok(/\/services\/iva\/assets\/633933\/video\.mp4/.test(playback.partKey), 'extra playback must expose the trailer media part');
  });
});

console.log('Real Plex extended detail metadata checks passed');
