'use strict';

var assert = require('assert');
var SupportSnapshot = require('../app/support-snapshot');
var SupportQr = require('../app/support-qr');

var lastPlayback = {
  title: 'Last episode',
  fileName: 'last-episode.mkv',
  fileSize: 1000,
  playbackMode: 'direct-play',
  mediaProfile: {
    container: 'MKV',
    width: 1920,
    height: 1080,
    resolution: '1080p',
    bitrate: 5000,
    videoCodec: 'HEVC',
    videoDynamicRange: 'HDR10',
    videoDetails: { profile: 'main 10', frameRate: '23.976', bitDepth: '10' },
    audioTracks: [{ language: 'Italiano', languageTag: 'it', codec: 'AC3', channels: 6, selected: true }],
    subtitleTracks: [{ language: 'Italiano', languageTag: 'it', codec: 'SRT', external: true, selected: true }]
  },
  audioTracks: [],
  subtitleTracks: [],
  options: { audioStreamID: 'a-last', subtitleStreamID: 's-last', subtitleSize: 100 },
  position: 120,
  duration: 1400,
  delivery: 'direct-play',
  strategy: 'direct-play',
  state: 'playing'
};

var failedPlayback = {
  title: 'Broken episode',
  fileName: '/private/media/Broken episode 4K.mkv',
  fileSize: 25000000000,
  playbackMode: 'transcode-audio-video',
  mediaProfile: {
    container: 'MKV',
    width: 3840,
    height: 2160,
    resolution: '4K',
    bitrate: 29200,
    videoCodec: 'HEVC',
    videoDynamicRange: 'Dolby Vision',
    videoDetails: { profile: 'main 10', frameRate: '23.976', bitDepth: '10', colorRange: 'tv', bitrate: 18000 },
    audioTracks: [
      { id: 'a-failed', language: 'Japanese', languageTag: 'ja', codec: 'TRUEHD', channels: 8, channelLayout: '7.1', bitrate: 6400, samplingRate: 48000, bitDepth: 24, profile: 'Atmos', selected: true, title: 'Studio mix' },
      { id: 'a-other', language: 'Italiano', languageTag: 'it', codec: 'AC3', channels: 2, selected: false, title: 'Stereo' }
    ],
    subtitleTracks: [
      { id: 's-failed', language: 'Italiano', languageTag: 'it', codec: 'ASS', external: true, forced: false, bitrate: 12, selected: true, title: 'Fansub' },
      { id: 's-other', language: 'English', languageTag: 'en', codec: 'SRT', external: false, selected: false, title: 'English' }
    ]
  },
  audioTracks: [],
  subtitleTracks: [],
  options: { audioStreamID: 'a-failed', subtitleStreamID: 's-failed', subtitleSize: 125 },
  position: 37,
  duration: 7200,
  delivery: 'transcode-audio-video',
  requestedMode: 'auto',
  strategy: 'transcode',
  attempts: ['direct-play', 'direct-stream', 'transcode'],
  fallback: 'transcode',
  state: 'stream-error',
  nativeReadyState: 3,
  nativeNetworkState: 2,
  nativeErrorCode: 4,
  subtitleOffsetMs: -100,
  subtitleSize: 125,
  queue: {
    playlistQueue: { kind: 'playlist', title: 'Demo playlist', index: 4, total: 20 }
  },
  sourceUrl: 'https://192.168.0.7:32400/video?X-Plex-Token=secret'
};

var report = SupportSnapshot.create({
  appVersion: '1.0.6-alpha',
  timestamp: '2026-08-05T10:20:30.000Z',
  server: { name: 'Private Plex', version: '1.42', addresses: [{ kind: 'local', uri: 'http://192.168.0.7:32400' }] },
  profile: { mode: 'plex', name: 'Viewer', accountToken: 'secret' },
  device: { modelName: 'LG TV', webOSVersion: '4.10', viewport: '1920x1080', uhd: true, hdr10: true },
  network: { status: 'local-only', lanAvailable: true, internetAvailable: false, localAddress: '192.168.0.20' },
  settings: { version: 3, visualTheme: 'immersive', playbackMode: 'auto', settingsBackupMode: 'on', adaptivePlaybackMemory: true, token: 'must-not-leak' },
  compatibility: { schemaVersion: 3, ruleVersion: 1, updatedAt: 1800000000000, deviceModel: 'LG TV', runtime: 'webOS 4 / Chrome 53', appVersion: '1.0.7', formatRuleCount: 2, fileExceptionCount: 3, fileExceptionTtlDays: 30, token: 'must-not-leak' },
  playback: lastPlayback,
  failurePlayback: failedPlayback,
  error: new Error('Playback failed at https://192.168.0.7/video?X-Plex-Token=secret'),
  events: [
    { type: 'prepare', detail: 'https://192.168.0.7/video?X-Plex-Token=secret' },
    { type: 'error', detail: 'decoder failed token=secret' }
  ],
  jsErrors: [
    {
      type: 'error',
      message: 'Uncaught decoder UI error',
      source: 'https://192.168.0.7:32400/app.js?X-Plex-Token=secret',
      line: 42,
      column: 7,
      stack: 'Error: Uncaught decoder UI error\n    at https://192.168.0.7:32400/app.js?X-Plex-Token=secret:42:7'
    }
  ]
});

assert.strictEqual(report.schema, 1, 'support reports must have a versioned schema');
assert.strictEqual(report.playback.source, 'playback-error', 'failed playback must take priority over the last playback');
assert.strictEqual(report.playback.media.title, 'Broken episode', 'the failed media title must be included');
assert.strictEqual(report.playback.media.fileName, 'Broken episode 4K.mkv', 'full file paths must be reduced to the file name');
assert.strictEqual(report.playback.media.video.codec, 'HEVC', 'video codec must remain available');
assert.strictEqual(report.playback.media.video.bitrate, 18000, 'video stream bitrate must remain available');
assert.strictEqual(report.playback.media.audioTracks[0].codec, 'TRUEHD', 'audio details must remain available');
assert.strictEqual(report.playback.media.audioTracks[0].bitrate, 6400, 'audio bitrate must remain available');
assert.strictEqual(report.playback.media.audioTracks[0].samplingRate, 48000, 'audio sampling rate must remain available');
assert.strictEqual(report.playback.media.audioTracks[0].profile, 'Atmos', 'audio profile must remain available');
assert.strictEqual(report.playback.media.audioTracks.length, 1, 'only the selected audio track must be exported');
assert.strictEqual(report.playback.media.subtitleTracks[0].codec, 'ASS', 'subtitle details must remain available');
assert.strictEqual(report.playback.media.subtitleTracks[0].bitrate, 12, 'subtitle bitrate must remain available when Plex exposes it');
assert.strictEqual(report.playback.media.subtitleTracks.length, 1, 'only the selected subtitle track must be exported');
assert.strictEqual(report.playback.attempts.join(','), 'direct-play,direct-stream,transcode', 'fallback attempts must remain available');
assert.deepStrictEqual(report.settings, { schemaVersion: 3, visualTheme: 'immersive', playbackMode: 'auto', settingsBackupMode: 'on', adaptivePlaybackMemory: true }, 'support reports must include only allow-listed settings');
assert.deepStrictEqual(report.compatibility, { schemaVersion: 3, ruleVersion: 1, updatedAt: 1800000000000, deviceModel: 'LG TV', runtime: 'webOS 4 / Chrome 53', appVersion: '1.0.7', formatRuleCount: 2, fileExceptionCount: 3, fileExceptionTtlDays: 30 }, 'support reports must include safe compatibility summary metadata');
assert.ok(report.body.indexOf('settings: schema=3 / theme=immersive / playback=auto / save=on / memory=on') !== -1, 'QR report must include current safe settings');
assert.ok(report.body.indexOf('compat: schema=3 / rule=1 / formats=2 / files=3 / ttl=30d') !== -1, 'QR report must include compatibility summary');
assert.strictEqual(report.profile.accountToken, undefined, 'credentials must never enter the report');
assert.strictEqual(report.network.localAddress, undefined, 'local IP addresses must never enter the report');
assert.ok(report.serialized.indexOf('X-Plex-Token') === -1, 'serialized support reports must not contain Plex tokens');
assert.ok(report.serialized.indexOf('192.168.0.7') === -1, 'serialized support reports must not contain IP addresses');
assert.ok(report.body.indexOf('X-Plex-Token') === -1, 'QR support reports must not contain Plex tokens');
assert.ok(report.body.indexOf('192.168.0.7') === -1, 'QR support reports must not contain IP addresses');
assert.ok(report.mailto.indexOf('mailto:') === 0, 'support reports must expose a mail draft URI');
assert.ok(report.serialized.length <= SupportSnapshot.MAX_SERIALIZED, 'serialized support reports must stay within the QR budget');
assert.ok(report.mailto.length <= SupportQr.MAX_INPUT, 'mail draft URI must remain within QR capacity');
assert.ok(report.body.indexOf('HEVC') !== -1, 'the QR report must include the video codec');
assert.ok(report.body.indexOf('18000kbps') !== -1, 'the QR report must include the video bitrate');
assert.ok(report.body.indexOf('TRUEHD') !== -1, 'the QR report must include the selected audio codec');
assert.ok(report.body.indexOf('ASS') !== -1, 'the QR report must include the selected subtitle codec');
assert.ok(report.body.indexOf('audio[1]:') === -1 && report.body.indexOf('audio[2]:') === -1, 'the QR report must not enumerate duplicate audio tracks');
assert.ok(report.body.indexOf('subtitle[1]:') === -1 && report.body.indexOf('subtitle[2]:') === -1, 'the QR report must not enumerate duplicate subtitle tracks');
assert.ok(report.body.indexOf('direct-play') !== -1, 'the QR report must include playback fallback attempts');
assert.ok(report.body.indexOf('v: 1.0.6-alpha') !== -1, 'the QR report must label the application version compactly');
assert.ok(report.body.indexOf('at: 2026-08-05T10:20:30.000Z') !== -1, 'the QR report must include its creation time');
assert.ok(report.body.indexOf('net: local-only / LAN online / internet offline') !== -1, 'the QR report must distinguish LAN and internet availability compactly');
assert.ok(report.body.indexOf('method: Transcoding (audio/video)') !== -1, 'the QR report must label audio/video transcoding clearly');
assert.ok(report.body.indexOf('queue: playlist / Demo playlist / 5/20') !== -1, 'the QR report must include queue context compactly');
assert.ok(report.body.indexOf('native: ready=3 / network=2 / error=4') !== -1, 'the QR report must include native media state');
assert.ok(report.body.indexOf('sub-settings: offset=-100ms / size=125%') !== -1, 'the QR report must include active subtitle settings');
assert.ok(report.body.indexOf('Ploff support report') === -1, 'the QR report must not repeat its enclosing modal title');
assert.ok(report.body.indexOf('js-error[1]:') !== -1 && report.body.indexOf('Uncaught decoder UI error') !== -1, 'the QR report must include collected JavaScript errors');
assert.ok(report.body.indexOf('Playback failed') !== -1, 'the QR report must include the playback error');
assert.ok(report.body.indexOf('192.168.0.7') === -1, 'JavaScript error sources and stacks must not expose IP addresses');
assert.doesNotThrow(function () { SupportQr.create(report.mailto); }, 'the failed playback report must remain QR-encodable');

var fallbackReport = SupportSnapshot.create({ playback: lastPlayback });
assert.strictEqual(fallbackReport.playback.source, 'last-playback', 'the last playback must be used when no error exists');
assert.strictEqual(fallbackReport.playback.media.title, 'Last episode');

console.log('Support snapshot checks passed');
