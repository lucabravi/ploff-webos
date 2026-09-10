'use strict';

var assert = require('assert');
var fs = require('fs');
var source = fs.readFileSync(require.resolve('../app/plex-client'), 'utf8');
var parserSource = fs.readFileSync(require.resolve('../app/plex-media-document'), 'utf8');
var playbackBody = source.slice(source.indexOf('  function loadPlayback('), source.indexOf('  function loadMediaProfile('));
var profileBody = source.slice(source.indexOf('  function loadMediaProfile('), source.indexOf('  function sendTimeline('));

assert.ok(/PlexMediaDocument/.test(source), 'PlexClient must depend on the dedicated media document parser');
assert.ok(/mediaDocumentFromXml\(xmlText/.test(playbackBody), 'playback loading must consume the shared media document parser');
assert.ok(/mediaDocumentFromXml\(xmlText/.test(profileBody), 'media profile loading must consume the shared media document parser');
assert.strictEqual((parserSource.match(/group\.parts\.push\(\{ part:/g) || []).length, 1,
  'Media/Part/Stream traversal must be implemented once in the dedicated parser');
assert.strictEqual((source.match(/group\.parts\.push\(\{ part:/g) || []).length, 0,
  'PlexClient transport must not reimplement Media/Part/Stream traversal');

console.log('Plex media document parsing checks passed');
