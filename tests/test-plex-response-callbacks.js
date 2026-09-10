'use strict';

var assert = require('assert');
var DOMParser = require('@xmldom/xmldom').DOMParser;
var Xhr = require('./helpers/controlled-xhr');
var Auth = require('../app/plex-auth');
var Client = require('../app/plex-client');
var Watchlist = require('../app/watchlist-client');
var config = { apiBaseUrl: 'https://plex.example', token: 'fixture-token' };
var mediaXml = '<MediaContainer size="1" totalSize="1"><Video type="movie" ratingKey="1" title="Example" duration="120000"><Media container="mp4" videoCodec="h264" audioCodec="aac"><Part id="10" key="/library/parts/10/file.mp4" duration="120000" /></Media></Video></MediaContainer>';
var cases = [
  ['watchlist discovery', function (root, cb) { Watchlist.discover(root, {}, cb); }, '{}', '{'],
  ['watchlist search', function (root, cb) { Watchlist.search(root, {}, 'Example', 5, cb); }, '{}', '{'],
  ['watchlist load', function (root, cb) { Watchlist.load(root, {}, 0, 5, cb); }, '{}', '{'],
  ['PIN creation', function (root, cb) { Auth.createPin(root, {}, cb); }, '<pin id="1" code="CODE"/>', '<invalid/>'],
  ['PIN polling', function (root, cb) { Auth.pollPin(root, '1', {}, cb); }, '<pin id="1" code="CODE"/>', '<invalid/>'],
  ['Home profiles', function (root, cb) { Auth.loadHomeUsers(root, 'fixture-token', {}, cb); }, '<MediaContainer><User id="1" title="Example"/></MediaContainer>', '<MediaContainer/>'],
  ['server access', function (root, cb) { Auth.loadServerAccess(root, 'fixture-token', 'server', {}, cb); }, '[{"clientIdentifier":"server","accessToken":"fixture-token","connections":[]}]', '{'],
  ['account servers', function (root, cb) { Auth.loadAccountServers(root, 'fixture-token', {}, cb); }, '[]', '{'],
  ['recommendation rows', function (_root, cb) { Client.loadLibraryRecommendations(config, {key:'1'}, cb); }, '<MediaContainer/>', '<parsererror/>'],
  ['account profile', function (_root, cb) { Client.loadAccountProfile(config, cb); }, '{}', '{'],
  ['navigation', function (_root, cb) { Client.loadNavigation(config, cb); }, '<MediaContainer/>', '<parsererror/>'],
  ['GUID lookup', function (_root, cb) { Client.findByGuid(config, 'plex://movie/example', cb); }, mediaXml, '<parsererror/>'],
  ['activities', function (_root, cb) { Client.loadActivities(config, cb); }, '{}', '{'],
  ['local search', function (_root, cb) { Client.search(config, 'Example', [], cb); }, mediaXml, '<parsererror/>'],
  ['library page', function (_root, cb) { Client.loadLibraryPage(config, {key:'1'}, 'catalog', {}, 0, 5, cb); }, mediaXml, '<parsererror/>'],
  ['container page', function (_root, cb) { Client.loadLibraryContainerPage(config, {containerKey:'/playlists/1/items'}, 0, 5, cb); }, mediaXml, '<parsererror/>'],
  ['backup playlist listing', function (_root, cb) { Client.loadSettingsBackupPlaylists(config, 'Ploff', 'marker', cb); }, '<MediaContainer/>', '<parsererror/>'],
  ['metadata', function (_root, cb) { Client.loadMetadata(config, '1', cb); }, mediaXml, '<parsererror/>'],
  ['extras', function (_root, cb) { Client.loadExtras(config, '1', cb); }, mediaXml, '<parsererror/>'],
  ['season episodes', function (_root, cb) { Client.loadSeasonEpisodes(config, '1', '', cb); }, mediaXml, '<parsererror/>'],
  ['playback response', function (_root, cb) { Client.loadPlayback(config, '1', 'session', null, cb); }, mediaXml, '<parsererror/>'],
  ['media profile', function (_root, cb) { Client.loadMediaProfile(config, '1', cb); }, mediaXml, '<parsererror/>'],
  ['server identity', function (_root, cb) { Client.loadServerIdentity(config, cb); }, '<MediaContainer machineIdentifier="server"/>', '<invalid/>']
];
var previousXhr = global.XMLHttpRequest;
var previousParser = global.DOMParser;
var failures = [];
var assertions = 0;

global.DOMParser = DOMParser;
try {
  cases.forEach(function (entry) {
    ['success', 'consumer-error', 'parse-error', 'transport-error'].forEach(function (mode) {
      var transport = Xhr.create();
      var calls = [];
      var consumerError = new Error('Consumer failure: ' + entry[0]);
      var thrown;
      global.XMLHttpRequest = transport.root.XMLHttpRequest;
      try {
        entry[1](transport.root, function (error, result) {
          calls.push({error:error, result:result});
          if (mode === 'consumer-error' && !error) { throw consumerError; }
        });
        assert.strictEqual(transport.requests.length, 1, 'must reach the real transport');
        try {
          transport.respond(0, mode === 'parse-error' ? entry[3] : entry[2], mode === 'transport-error' ? 503 : 200);
        } catch (error) { thrown = error; }
        assert.strictEqual(calls.length, 1, 'completion must be delivered once, not reclassified as a parser failure');
        if (mode === 'parse-error' || mode === 'transport-error') {
          assert.ok(calls[0].error instanceof Error, 'real parser/transport errors must still reach the consumer');
          assert.strictEqual(calls[0].result, undefined);
        } else {
          assert.ifError(calls[0].error);
          assert.notStrictEqual(calls[0].result, undefined, 'success must retain its parsed result');
        }
        assert.strictEqual(thrown, mode === 'consumer-error' ? consumerError : undefined, 'consumer exceptions must escape unchanged');
        assert.strictEqual(transport.requests[0].onreadystatechange, null, 'transport handlers must be released even when the consumer throws');
        transport.respond(0, entry[2]);
        assert.strictEqual(calls.length, 1, 'late transport notifications must not repeat completion');
        assertions += 1;
      } catch (error) {
        failures.push(entry[0] + ' / ' + mode + ': ' + error.message);
      }
    });
  });
} finally {
  if (previousXhr === undefined) { delete global.XMLHttpRequest; } else { global.XMLHttpRequest = previousXhr; }
  if (previousParser === undefined) { delete global.DOMParser; } else { global.DOMParser = previousParser; }
}
failures.forEach(function (failure) { console.error(failure); });
assert.strictEqual(failures.length, 0, failures.length + ' callback-boundary cases failed');
console.log('Plex response callback checks passed (' + assertions + ' cases)');
