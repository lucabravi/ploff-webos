'use strict';

var assert = require('assert');
var fs = require('fs');
var source = fs.readFileSync(require.resolve('../app/plex-client'), 'utf8');
var playbackBody = source.slice(source.indexOf('  function loadPlayback('), source.indexOf('  function loadMediaProfile('));
var profileBody = source.slice(source.indexOf('  function loadMediaProfile('), source.indexOf('  function sendTimeline('));

assert.ok(/function mediaDocumentFromXml\(/.test(source), 'Plex metadata XML must have one authoritative Media/Part/Stream parser');
assert.ok(/mediaDocumentFromXml\(xmlText/.test(playbackBody), 'playback loading must consume the shared media document parser');
assert.ok(/mediaDocumentFromXml\(xmlText/.test(profileBody), 'media profile loading must consume the shared media document parser');
assert.strictEqual((source.match(/group\.parts\.push\(\{ part:/g) || []).length, 1,
  'Media/Part/Stream traversal must be implemented once');

console.log('Plex media document parsing checks passed');
