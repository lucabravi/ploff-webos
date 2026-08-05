'use strict';

var assert = require('assert');
var PlaybackUrls = require('../app/plex-playback-urls');

assert.strictEqual(PlaybackUrls.playbackModeFromDecisions('copy', 'copy'), 'direct-stream', 'copy decisions map to Direct Stream');
assert.strictEqual(PlaybackUrls.playbackModeFromDecisions('transcode', 'copy'), 'transcode-video', 'a video transcode keeps its distinct mode');
assert.ok(
  PlaybackUrls.buildSubtitleOffsetUrl({ apiBaseUrl: 'https://plex.example', token: 'secret' }, '9', 100)
    .indexOf('/library/streams/9?offset=100&X-Plex-Token=secret') !== -1,
  'builds the server-side subtitle offset endpoint'
);
assert.ok(
  PlaybackUrls.buildStreamSelectionUrl({ apiBaseUrl: 'https://plex.example', token: 'secret' }, '4', '5', '6')
    .indexOf('/library/parts/4?audioStreamID=5&subtitleStreamID=6&allParts=1&X-Plex-Token=secret') !== -1,
  'builds stream selection requests without mixing playback state into the URL layer'
);

console.log('Plex playback URL checks passed');
