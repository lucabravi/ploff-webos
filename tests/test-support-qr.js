'use strict';

var assert = require('assert');
var SupportQr = require('../app/support-qr');
var SupportSnapshot = require('../app/support-snapshot');

var first = SupportQr.create('mailto:?subject=Ploff%20support&body=Playback%20error');
var second = SupportQr.create('mailto:?subject=Ploff%20support&body=Playback%20error');

assert.ok(first.version >= 1, 'QR payloads must select a valid QR version');
assert.strictEqual(first.size, first.modules.length, 'QR size must match the module matrix');
assert.strictEqual(first.modules.length, first.modules[0].length, 'QR modules must be square');
assert.deepStrictEqual(first.modules, second.modules, 'QR generation must be deterministic');
assert.strictEqual(first.modules[0][0], true, 'the generated QR must contain a finder pattern');
assert.strictEqual(first.modules[0][first.size - 1], true, 'the generated QR must contain the top-right finder pattern');
assert.strictEqual(first.modules[first.size - 1][0], true, 'the generated QR must contain the bottom-left finder pattern');
assert.throws(function () { SupportQr.create(new Array(5000).join('x')); }, /too large/i, 'QR payloads must be bounded');

var report = SupportSnapshot.create({
  appVersion: '1.0.6-alpha',
  playback: {
    title: 'Last episode',
    fileName: 'last.mkv',
    duration: 1400,
    mediaProfile: {
      container: 'MKV',
      resolution: '1080p',
      width: 1920,
      height: 1080,
      bitrate: 5000,
      videoCodec: 'HEVC',
      videoDetails: { profile: 'main 10', frameRate: '23.976', bitDepth: '10' },
      audioTracks: [{ language: 'Italiano', codec: 'AC3', channels: 6, bitrate: 640, selected: true }],
      subtitleTracks: [{ language: 'Italiano', codec: 'SRT', external: true, selected: true }]
    },
    delivery: 'direct-play',
    state: 'playing'
  },
  error: 'Playback failed'
});
assert.doesNotThrow(function () { SupportQr.create(report.mailto); }, 'a detailed support report must remain QR-encodable');

console.log('Support QR checks passed');
