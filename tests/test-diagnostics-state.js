'use strict';

var assert = require('assert');
var Diagnostics = require('../shell/diagnostics-state');

assert.strictEqual(Diagnostics.abbreviateIdentifier('abcdef1234567890'), 'abcd...7890', 'machine identifiers must be abbreviated');
assert.strictEqual(Diagnostics.abbreviateIdentifier('short'), 'short', 'short non-secret identifiers may remain readable');
assert.strictEqual(Diagnostics.sanitizeText('GET http://server/video?X-Plex-Token=secret-token failed'), 'GET [url] failed', 'authenticated URLs must be removed from errors');
assert.strictEqual(Diagnostics.sanitizeText('token=secret-value caused ghp_abcdefghijklmnopqrstuvwxyz'), 'token=[redacted] caused [redacted]', 'token-like values must be redacted case-insensitively');

var snapshot = Diagnostics.snapshot({
  appVersion: '1.0.77',
  server: {
    name: 'Mac Mini M4', version: '1.41.7', machineIdentifier: 'abcdef1234567890', reachable: true, token: 'must-not-leak',
    addresses: [
      { kind: 'local', uri: 'http://192.168.50.10:32400/' },
      { kind: 'remote', uri: 'https://plex.example/path?X-Plex-Token=must-not-leak' }
    ]
  },
  profile: { mode: 'plex', name: 'Example User', accountToken: 'must-not-leak' },
  device: { modelName: 'LG OLED', webOSVersion: '3.9', viewport: '1920x1080', known: true, uhd: true, hdr10: true, userAgent: 'private' },
  playback: {
    fileName: 'Episode 03.mkv',
    fileSize: 1572864000,
    source: '3840x2160 / HEVC / MKV / HDR10',
    delivery: 'transcode-audio',
    strategy: 'direct-stream',
    attempts: ['direct-play', 'direct-stream'],
    fallback: 'direct-stream',
    position: 793,
    duration: 1470,
    buffered: '780-810',
    state: 'playing',
    sourceUrl: 'http://server/video?X-Plex-Token=secret'
  },
  error: new Error('Plex request failed at http://server/path?X-Plex-Token=secret')
});

assert.deepStrictEqual(snapshot.server, {
  name: 'Mac Mini M4',
  version: '1.41.7',
  machineIdentifier: 'abcd...7890',
  reachable: true,
  addresses: [
    { kind: 'local', uri: 'http://192.168.50.10:32400' },
    { kind: 'remote', uri: 'https://plex.example' }
  ]
}, 'server diagnostics must retain safe Plex origins without paths, credentials or tokens');
assert.deepStrictEqual(snapshot.profile, { mode: 'plex', name: 'Example User' }, 'profile diagnostics must exclude account credentials');
assert.deepStrictEqual(snapshot.device, { modelName: 'LG OLED', webOSVersion: '3.9', viewport: '1920x1080', known: true, uhd: true, hdr10: true }, 'device diagnostics must exclude the raw browser agent');
assert.strictEqual(snapshot.playback.sourceUrl, undefined, 'playback diagnostics must never retain authenticated URLs');
assert.deepStrictEqual(snapshot.playback.attempts, ['direct-play', 'direct-stream'], 'bounded recovery attempts must remain visible');
assert.strictEqual(snapshot.error, 'Plex request failed at [url]', 'diagnostic errors must be sanitized');
assert.strictEqual(snapshot.appVersion, '1.0.77', 'the app version must remain visible');
assert.deepStrictEqual(Diagnostics.snapshot({ appVersion: '1.0.77' }).playback, null, 'diagnostics must work before any playback exists');

console.log('Diagnostics state checks passed');
