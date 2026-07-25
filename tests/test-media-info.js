'use strict';

var assert = require('assert');
var MediaInfo = require('../app/media-info');

var model = MediaInfo.create({
  fileName: '/private/var/media/Example.Movie.2026.mkv',
  formattedSize: '2.4 GB',
  container: 'MKV',
  duration: 1439000,
  resolution: '1080p',
  width: 1920,
  height: 1080,
  bitrate: 12000,
  videoCodec: 'HEVC',
  videoDynamicRange: 'HDR10',
  videoDetails: { profile: 'main 10', frameRate: '23.976', bitDepth: '10', colorRange: 'tv' },
  audioTracks: [{ id: '1', language: 'Japanese', codec: 'TRUEHD', channels: 8, displayTitle: 'Japanese (TRUEHD 7.1)' }],
  subtitleTracks: [{ id: '2', language: 'Italian', codec: 'SRT', displayTitle: 'Italian (SRT External)' }]
}, { audioStreamID: '1', subtitleStreamID: '2' }, function (key) { return key; });

assert.strictEqual(model.sections[0].title, 'mediaDetails.file', 'the first section must identify the selected file version');
assert.strictEqual(model.sections[0].rows[0].value, 'Example.Movie.2026.mkv', 'the UI model must never expose a full local path');
assert.ok(model.sections[1].rows.some(function (row) { return row.value === 'HEVC'; }), 'video codec must be present in a TV-readable model');
assert.ok(model.sections[2].rows.some(function (row) { return row.value === 'Japanese (TRUEHD 7.1)'; }), 'the selected audio track must retain Plex display details');
assert.ok(model.sections[3].rows.some(function (row) { return row.value === 'Italian (SRT External)'; }), 'the selected subtitle track must retain Plex display details');
assert.ok(!JSON.stringify(model).match(/private\/var/), 'media details must not leak an original filesystem path');

console.log('Media info checks passed');
