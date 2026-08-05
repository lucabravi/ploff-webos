'use strict';

var assert = require('assert');
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
    element('Stream', { id: 'subtitle-1', streamType: '3', language: 'Italiano', languageTag: 'it', codec: 'srt', key: '/library/streams/1' })
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
  this.open = function () {};
  this.send = function () {};
  this.abort = function () {};
};

var playback = null;
PlexClient.loadPlayback({ apiBaseUrl: '/plex-api', token: '' }, '42', 'session', function (error, value) {
  assert.ifError(error);
  playback = value;
});
requests[0].status = 200;
requests[0].readyState = 4;
requests[0].responseText = '<xml/>';
requests[0].onreadystatechange();

var profile = null;
PlexClient.loadMediaProfile({ apiBaseUrl: '/plex-api', token: '' }, '42', function (error, value) {
  assert.ifError(error);
  profile = value;
});
requests[1].status = 200;
requests[1].readyState = 4;
requests[1].responseText = '<xml/>';
requests[1].onreadystatechange();

assert.strictEqual(parseCount, 2, 'each metadata request must parse its XML exactly once');
assert.strictEqual(playback.mediaVersions.length, 2, 'playback must retain every parsed Plex version');
assert.strictEqual(profile.versions.length, 2, 'media detail must retain the same parsed Plex versions');
assert.deepStrictEqual(playback.mediaVersions.map(function (item) { return [item.mediaIndex, item.partIndex, item.partId]; }),
  profile.versions.map(function (item) { return [item.mediaIndex, item.partIndex, item.partId]; }),
  'playback and media detail must preserve identical Media/Part ordering');
assert.deepStrictEqual(playback.audioTracks[0], PlexClient.trackFromAttributes({
  id: 'audio-2', streamType: '2', language: 'English', languageTag: 'en', codec: 'aac', selected: '1', channels: '6'
}), 'playback must consume the streams belonging to the selected parsed version');
assert.strictEqual(profile.versions[playback.mediaIndex].audioTracks[0].id, playback.audioTracks[0].id,
  'media detail and playback must preserve the same track identity for the selected version');

global.DOMParser = previousDomParser;
global.XMLHttpRequest = previousXhr;

console.log('Plex media document runtime checks passed');
