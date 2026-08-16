'use strict';

var assert = require('assert');
var PlexClient = require('../app/plex-client');

var previousXhr = global.XMLHttpRequest;
var xhrs = [];

global.XMLHttpRequest = function () {
  xhrs.push(this);
  this.open = function (method, url) { this.method = method; this.url = url; };
  this.send = function () {};
  this.abort = function () { this.aborted = true; };
};

function cancellable(label, start) {
  var before = xhrs.length;
  var handle = start();
  assert.ok(handle && typeof handle.abort === 'function', label + ' must return a cancellable transport handle');
  assert.strictEqual(xhrs.length, before + 1, label + ' must start one transport request');
  handle.abort();
  assert.strictEqual(xhrs[before].aborted, true, label + ' cancellation must reach the native request');
}

var config = { apiBaseUrl: '/plex-api', accountBaseUrl: '/account', token: 'token' };
cancellable('account profile loading', function () { return PlexClient.loadAccountProfile(config, function () {}); });
cancellable('navigation loading', function () { return PlexClient.loadNavigation(config, function () {}); });
cancellable('metadata loading', function () { return PlexClient.loadMetadata(config, '10', function () {}); });
cancellable('playback loading', function () { return PlexClient.loadPlayback(config, '11', 'session', {}, function () {}); });
cancellable('playback preparation', function () {
  return PlexClient.preparePlayback(config, {
    key: '/library/metadata/11', session: 'session', transcodeSession: 'session', mediaIndex: 0, partIndex: 0
  }, { delivery: 'direct-stream', playbackMode: 'auto', mediaIndex: 0, partIndex: 0 }, function () {});
});
cancellable('season loading', function () { return PlexClient.loadSeasonEpisodes(config, '20', '', function () {}); });
cancellable('series context loading', function () {
  return PlexClient.loadSeriesContext(config, { type: 'show', ratingKey: '30' }, function () {});
});
cancellable('watched-state updates', function () {
  return PlexClient.setWatchedAndReset(config, '40', true, function () {});
});
cancellable('Continue Watching removal', function () {
  return PlexClient.removeFromContinueWatching(config, '42', function () {});
});
assert.strictEqual(xhrs[xhrs.length - 1].method, 'PUT', 'Continue Watching removal must use the PMS PUT action');
assert.ok(/\/actions\/removeFromContinueWatching\?/.test(xhrs[xhrs.length - 1].url) && /ratingKey=42/.test(xhrs[xhrs.length - 1].url), 'Continue Watching removal must send the selected rating key');

var watchedHandle = PlexClient.setWatchedAndReset(config, '41', true, function () {});
var watchedRequest = xhrs[xhrs.length - 1];
watchedRequest.status = 200;
watchedRequest.readyState = 4;
watchedRequest.onreadystatechange();
var progressRequest = xhrs[xhrs.length - 1];
assert.notStrictEqual(progressRequest, watchedRequest, 'a successful watched update must start progress reset');
watchedHandle.abort();
assert.strictEqual(progressRequest.aborted, true, 'composite watched cancellation must abort the active progress reset');

var previousDomParser = global.DOMParser;
function directory(attributes) {
  return {
    nodeType: 1,
    nodeName: 'Directory',
    attributes: Object.keys(attributes).map(function (name) { return { name: name, value: String(attributes[name]) }; }),
    childNodes: []
  };
}
global.DOMParser = function () {
  this.parseFromString = function () {
    return {
      documentElement: { childNodes: [directory({ ratingKey: 'season-1', index: '1', title: 'Season 1' })] },
      getElementsByTagName: function () { return []; }
    };
  };
};
var seriesHandle = PlexClient.loadSeriesContext(config, { type: 'show', ratingKey: '50' }, function () {});
var seasonsRequest = xhrs[xhrs.length - 1];
seasonsRequest.status = 200;
seasonsRequest.readyState = 4;
seasonsRequest.responseText = '<seasons/>';
seasonsRequest.onreadystatechange();
var episodesRequest = xhrs[xhrs.length - 1];
assert.notStrictEqual(episodesRequest, seasonsRequest, 'series context must continue with the selected season request');
seriesHandle.abort();
assert.strictEqual(episodesRequest.aborted, true, 'series context cancellation must follow the active child request');
global.DOMParser = previousDomParser;

global.XMLHttpRequest = previousXhr;

console.log('Plex request contract checks passed');
