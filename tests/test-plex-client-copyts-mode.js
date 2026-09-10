'use strict';

var assert = require('assert');
var PlexClient = require('../app/plex-client');
var previousXhr = global.XMLHttpRequest;
var requests = [];

global.XMLHttpRequest = function () {
  requests.push(this);
  this.open = function (method, url) { this.method = method; this.url = url; };
  this.send = function () {};
  this.abort = function () {};
};

var config = { apiBaseUrl: 'http://plex.local:32400', token: 'secret' };
var playback = {
  key: '/library/metadata/11',
  session: 'playback-session',
  transcodeSession: 'transcode-session',
  mediaIndex: 0,
  partIndex: 0,
  directSeekTarget: 311
};
var handle = PlexClient.preparePlayback(config, playback, {
  delivery: 'direct-stream', playbackMode: 'auto', mediaIndex: 0, partIndex: 0, offset: 0
}, function () {});

assert.strictEqual(requests.length, 1, 'Direct Stream rebuild preparation must issue one decision request');
assert.ok(requests[0].url.indexOf('copyts=0') !== -1, 'Direct Stream preparation must retain the stable copyts=0 decision semantics');
assert.ok(playback.sourceUrl.indexOf('copyts=0') !== -1, 'Direct Stream HLS sources must retain the stable copyts=0 semantics');
if (handle && handle.abort) { handle.abort(); }
playback.directSeekTarget = null;
handle = PlexClient.preparePlayback(config, playback, {
  delivery: 'direct-stream', playbackMode: 'auto', mediaIndex: 0, partIndex: 0, offset: 120
}, function () {});
assert.ok(requests[1].url.indexOf('copyts=0') !== -1, 'ordinary offset Direct Stream preparation must retain copyts=0');
assert.ok(playback.sourceUrl.indexOf('copyts=0') !== -1, 'ordinary offset HLS source must retain copyts=0');
if (handle && handle.abort) { handle.abort(); }
global.XMLHttpRequest = previousXhr;

console.log('Plex copyts stability checks passed');
