'use strict';

var assert = require('assert');
var PlexUrl = require('../app/plex-url');

assert.strictEqual(
  PlexUrl.buildUrl('https://plex.example/', '/library/metadata/12', { includeGuids: 1 }, 'secret'),
  'https://plex.example/library/metadata/12?includeGuids=1&X-Plex-Token=secret',
  'normalizes slashes and adds encoded Plex query parameters'
);
assert.strictEqual(
  PlexUrl.assetUrl('https://plex.example', '/library/metadata/12/thumb', 'secret'),
  'https://plex.example/library/metadata/12/thumb?X-Plex-Token=secret',
  'turns relative artwork paths into authenticated server URLs'
);
assert.strictEqual(
  PlexUrl.assetUrl('https://plex.example', 'https://cdn.example/image.jpg', 'secret'),
  'https://cdn.example/image.jpg',
  'preserves already absolute artwork URLs'
);
assert.ok(
  PlexUrl.posterUrl({ apiBaseUrl: 'https://plex.example', token: 'secret' }, '/library/metadata/12/thumb', 280, 519)
    .indexOf('width=280') !== -1,
  'creates bounded poster transcode URLs'
);

console.log('Plex URL checks passed');
