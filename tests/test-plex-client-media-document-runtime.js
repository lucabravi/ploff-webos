'use strict';

var assert = require('assert');
var MediaProfile = require('../app/media-profile');
var PlexClient = require('../app/plex-client');

function element(name, attributes, children) {
  var source = attributes || {};
  var childNodes = children || [];
  return {
    nodeType: 1,
    nodeName: name,
    attributes: Object.keys(source).map(function (key) { return { name: key, value: String(source[key]) }; }),
    childNodes: childNodes,
    getAttribute: function (key) { return source[key] === undefined ? null : String(source[key]); },
    getElementsByTagName: function (tagName) {
      var result = [];
      childNodes.forEach(function visit(child) {
        var nested;
        if (!child || child.nodeType !== 1) { return; }
        if (child.nodeName === tagName) { result.push(child); }
        nested = child.getElementsByTagName(tagName);
        result = result.concat(nested);
      });
      return result;
    }
  };
}

function mediaDocument() {
  var partOne = element('Part', { id: 'part-1', key: '/library/parts/1/file.mkv', file: '/media/one.mkv', size: '1000', duration: '120000' }, [
    element('Stream', { id: 'audio-1', streamType: '2', language: 'Japanese', languageTag: 'ja', codec: 'aac', selected: '1', channels: '2' }),
    element('Stream', { id: 'subtitle-1', streamType: '3', language: 'Italiano', languageTag: 'it', codec: 'ass', key: '/library/streams/1' })
  ]);
  var partTwo = element('Part', { id: 'part-2', key: '/library/parts/2/file.mkv', file: '/media/two.mkv', size: '2000', duration: '120000' }, [
    element('Stream', { id: 'audio-2', streamType: '2', language: 'English', languageTag: 'en', codec: 'aac', selected: '1', channels: '6' })
  ]);
  var video = element('Video', { ratingKey: '42', type: 'movie', title: 'Example', duration: '120000' }, [
    element('Media', { id: 'media-1', container: 'mkv', videoCodec: 'h264', videoResolution: '1080', width: '1920', height: '1080' }, [partOne]),
    element('Media', { id: 'media-2', container: 'mkv', videoCodec: 'hevc', videoResolution: '4k', width: '3840', height: '2160' }, [partTwo])
  ]);
  var root = element('MediaContainer', {}, [video]);
  return {
    documentElement: root,
    getElementsByTagName: function (name) {
      if (name === 'parsererror') { return []; }
      if (name === 'Video') { return [video]; }
      return root.getElementsByTagName(name);
    }
  };
}

function seasonDocument() {
  var first = element('Video', { ratingKey: '101', type: 'episode', parentIndex: '1', index: '1', title: 'One' }, [
    element('Media', { container: 'mkv', videoResolution: '1080' }, [
      element('Part', { id: 'part-101', file: '/media/one.mkv', size: '1000' }, [])
    ])
  ]);
  var second = element('Video', { ratingKey: '102', type: 'episode', parentIndex: '1', index: '2', title: 'Two' }, [
    element('Media', { container: 'mp4', videoResolution: '720' }, [
      element('Part', { id: 'part-102', file: '/media/two.mp4', size: '2000' }, [])
    ])
  ]);
  var root = element('MediaContainer', {}, [first, second]);
  return {
    documentElement: root,
    getElementsByTagName: function (name) {
      if (name === 'parsererror') { return []; }
      if (name === 'Video') { return [first, second]; }
      return root.getElementsByTagName(name);
    }
  };
}

var previousDomParser = global.DOMParser;
var previousXhr = global.XMLHttpRequest;
var requests = [];
var parseCount = 0;

global.DOMParser = function () {
  this.parseFromString = function () {
    parseCount += 1;
    return mediaDocument();
  };
};

global.XMLHttpRequest = function () {
  requests.push(this);
  this.open = function (method, url) { this.method = method; this.url = url; };
  this.send = function () {};
  this.abort = function () {};
};

var detail = null;
PlexClient.loadMetadata({ apiBaseUrl: '/plex-api', token: '' }, '42', function (error, value) {
  assert.ifError(error);
  detail = value;
});
requests[0].status = 200;
requests[0].readyState = 4;
requests[0].responseText = '<xml/>';
requests[0].onreadystatechange();

var playback = null;
PlexClient.loadPlayback({ apiBaseUrl: '/plex-api', token: '' }, '42', 'session', function (error, value) {
  assert.ifError(error);
  playback = value;
});
requests[1].status = 200;
requests[1].readyState = 4;
requests[1].responseText = '<xml/>';
requests[1].onreadystatechange();

var profile = null;
PlexClient.loadMediaProfile({ apiBaseUrl: '/plex-api', token: '' }, '42', function (error, value) {
  assert.ifError(error);
  profile = value;
});
requests[2].status = 200;
requests[2].readyState = 4;
requests[2].responseText = '<xml/>';
requests[2].onreadystatechange();

assert.strictEqual(parseCount, 3, 'each metadata request must parse its XML exactly once');
assert.ok(detail.mediaProfile, 'the first detail metadata response must expose its playable MediaProfile without a second request');
assert.strictEqual(detail.mediaProfile.versions.length, 2, 'detail metadata must retain every playable version from the first response');
assert.strictEqual(detail.mediaProfile.versions[0].subtitleTracks[0].key, '/library/streams/1', 'the first metadata response must expose the external subtitle key needed for immediate ASS prefetch');
assert.deepStrictEqual(detail.mediaProfile.versions.map(function (item) { return [item.mediaIndex, item.partIndex, item.partId]; }),
  profile.versions.map(function (item) { return [item.mediaIndex, item.partIndex, item.partId]; }),
  'the profile extracted from loadMetadata must match the dedicated media-profile parser');
assert.strictEqual(playback.mediaVersions.length, 2, 'playback must retain every parsed Plex version');
assert.strictEqual(profile.versions.length, 2, 'media detail must retain the same parsed Plex versions');
assert.deepStrictEqual(playback.mediaVersions.map(function (item) { return [item.mediaIndex, item.partIndex, item.partId]; }),
  profile.versions.map(function (item) { return [item.mediaIndex, item.partIndex, item.partId]; }),
  'playback and media detail must preserve identical Media/Part ordering');
assert.deepStrictEqual(playback.audioTracks[0], MediaProfile.trackFromAttributes({
  id: 'audio-2', streamType: '2', language: 'English', languageTag: 'en', codec: 'aac', selected: '1', channels: '6'
}), 'playback must consume the streams belonging to the selected parsed version');
assert.strictEqual(profile.versions[playback.mediaIndex].audioTracks[0].id, playback.audioTracks[0].id,
  'media detail and playback must preserve the same track identity for the selected version');

var selectionError = null;
var selectionPlayback = null;
PlexClient.loadPlayback({ apiBaseUrl: '/plex-api', token: '' }, '42', 'session-with-preferences', {}, function (error, value) {
  selectionError = error || null;
  selectionPlayback = value || null;
});
requests[3].status = 200;
requests[3].readyState = 4;
requests[3].responseText = '<xml/>';
requests[3].onreadystatechange();
assert.strictEqual(requests[4].method, 'PUT', 'playback preferences must persist the selected Plex streams before reporting readiness');
requests[4].status = 500;
requests[4].readyState = 4;
requests[4].responseText = '';
requests[4].onreadystatechange();
assert.ok(selectionError, 'stream-selection failure must fail loadPlayback instead of starting playback with stale Plex tracks');
assert.strictEqual(selectionPlayback, null, 'failed stream selection must not publish a ready playback object');

global.DOMParser = function () {
  this.parseFromString = function () { return seasonDocument(); };
};
var seasonEpisodes = null;
PlexClient.loadSeasonEpisodes({ apiBaseUrl: '/plex-api', token: '' }, 'season-1', '', function (error, value) {
  assert.ifError(error);
  seasonEpisodes = value;
});
requests[5].status = 200;
requests[5].readyState = 4;
requests[5].responseText = '<xml/>';
requests[5].onreadystatechange();
assert.strictEqual(seasonEpisodes.length, 2);
assert.strictEqual(seasonEpisodes[0].mediaProfile.container, 'MKV',
  'season children must retain the lightweight Media/Part profile already returned by Plex');
assert.strictEqual(seasonEpisodes[1].mediaProfile.versions.length, 1,
  'each episode in a batch season response must retain its own version list');

global.DOMParser = previousDomParser;
global.XMLHttpRequest = previousXhr;

console.log('Plex media document runtime checks passed');
