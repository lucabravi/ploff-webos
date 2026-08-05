'use strict';

var assert = require('assert');
var PlexFeaturePorts = require('../app/coordinator/plex-feature-ports');

var names = [
  'findByGuid', 'loadAccountProfile', 'loadActivities', 'loadHome',
  'loadLibraryContainerPage', 'loadLibraryFilterOptions', 'loadLibraryPage',
  'loadLibraryRecommendations', 'loadMediaProfile', 'loadMetadata',
  'loadNavigation', 'loadPlayback', 'loadSeasonEpisodes', 'loadSeriesContext',
  'loadServerIdentity', 'loadSubtitleText', 'pingTranscode', 'posterUrl',
  'preparePlayback', 'refreshLibrary', 'refreshLibraryMetadata',
  'refreshMetadata', 'rotateTranscodeSession', 'search', 'sendTimeline',
  'setStreamSelection', 'setSubtitleOffset', 'setWatchedAndReset', 'unexpected'
];
var client = { marker: 'plex-client' };
var calls = [];

names.forEach(function (name) {
  client[name] = function (first, second) {
    calls.push({ name: name, context: this, first: first, second: second });
    return name + ':' + first + ':' + second;
  };
});

function verify(factory, expected) {
  var port = factory(client);
  assert.deepStrictEqual(Object.keys(port).sort(), expected.slice().sort(), 'port must expose only its declared Plex operations');
  expected.forEach(function (name) {
    calls = [];
    assert.strictEqual(port[name]('one', 'two'), name + ':one:two', name + ' must preserve the return value');
    assert.deepStrictEqual(calls, [{ name: name, context: client, first: 'one', second: 'two' }], name + ' must preserve arguments and PlexClient as this');
  });
  assert.strictEqual(port.unexpected, undefined, 'unrelated Plex operations must not leak into a feature port');
}

verify(PlexFeaturePorts.server, ['loadAccountProfile', 'loadActivities', 'loadNavigation', 'loadServerIdentity']);
verify(PlexFeaturePorts.shell, ['loadHome', 'loadMetadata', 'posterUrl']);
verify(PlexFeaturePorts.search, ['findByGuid', 'search']);
verify(PlexFeaturePorts.library, [
  'findByGuid', 'loadLibraryContainerPage', 'loadLibraryFilterOptions',
  'loadLibraryPage', 'loadLibraryRecommendations', 'refreshLibrary',
  'refreshLibraryMetadata'
]);
verify(PlexFeaturePorts.detail, [
  'loadMediaProfile', 'loadMetadata', 'loadSeasonEpisodes', 'loadSeriesContext',
  'refreshMetadata', 'setWatchedAndReset'
]);
assert.strictEqual(PlexFeaturePorts.player(client), client, 'the Player port must preserve the exact PlexClient object and its complete playback API');
assert.throws(function () {
  PlexFeaturePorts.search({ search: function () {} });
}, /PlexFeaturePorts requires PlexClient\.findByGuid/, 'a missing declared operation must fail fast during composition');

console.log('Plex feature port checks passed');
