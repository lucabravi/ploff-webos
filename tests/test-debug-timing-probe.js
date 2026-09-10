'use strict';

var assert = require('assert');
var Probe = null;

try { Probe = require('../app/debug-timing-probe'); }
catch (error) { Probe = null; }

assert.ok(Probe && typeof Probe.create === 'function', 'debug timing probe must expose a testable factory');
assert.strictEqual(typeof Probe.rewriteCopyts, 'function', 'debug timing probe must expose copyts URL rewriting');
assert.strictEqual(typeof Probe.rewriteShadowUrl, 'function', 'debug timing probe must expose isolated shadow URL rewriting');
assert.strictEqual(typeof Probe.classifyPayload, 'function', 'debug timing probe must expose privacy-safe payload classification');

var baseHls = 'http://plex.local:32400/video/:/transcode/universal/start.m3u8?offset=491&copyts=0&X-Plex-Token=secret';
assert.strictEqual(
  Probe.rewriteCopyts(baseHls, '0'),
  baseHls,
  'copyts=0 control mode must preserve the current Plex request exactly'
);
assert.strictEqual(
  Probe.rewriteCopyts(baseHls, '1'),
  'http://plex.local:32400/video/:/transcode/universal/start.m3u8?offset=491&copyts=1&X-Plex-Token=secret',
  'copyts=1 mode must replace only the copyts value'
);
assert.strictEqual(
  Probe.rewriteCopyts(baseHls, 'omit'),
  'http://plex.local:32400/video/:/transcode/universal/start.m3u8?offset=491&X-Plex-Token=secret',
  'omitted mode must remove copyts without disturbing the token or other parameters'
);
assert.strictEqual(
  Probe.rewriteCopyts('http://plex.local/start.m3u8?offset=12#frag', '1'),
  'http://plex.local/start.m3u8?offset=12&copyts=1#frag',
  'copyts override must be appendable when the parameter is absent'
);
assert.strictEqual(
  Probe.rewriteCopyts('http://plex.local/start.m3u8?offset=12#frag', 'omit'),
  'http://plex.local/start.m3u8?offset=12#frag',
  'omitted mode must leave an already omitted parameter unchanged'
);

var shadowUrl = Probe.rewriteShadowUrl(
  'http://plex.local/start.m3u8?offset=491&copyts=0&session=main&transcodeSessionId=main&X-Plex-Session-Identifier=main&X-Plex-Token=secret',
  'probe-e-1'
);
assert.ok(/copyts=1/.test(shadowUrl), 'shadow probe must preserve timestamps independently of playback');
assert.ok(/session=probe-e-1/.test(shadowUrl), 'shadow probe must use an isolated Plex session');
assert.ok(/transcodeSessionId=probe-e-1/.test(shadowUrl), 'shadow probe must isolate the transcode session id');
assert.ok(/X-Plex-Session-Identifier=probe-e-1/.test(shadowUrl), 'shadow probe must isolate the Plex session identifier');
assert.ok(/offset=491/.test(shadowUrl) && /X-Plex-Token=secret/.test(shadowUrl), 'shadow rewriting must preserve target and authentication');
assert.strictEqual(Probe.classifyPayload(new Uint8Array([0x47, 0, 0, 0])), 'mpeg-ts', 'TS sync byte must be classified without retaining payload contents');
assert.strictEqual(Probe.classifyPayload(new Uint8Array([0x23, 0x45, 0x58, 0x54, 0x4d, 0x33, 0x55])), 'playlist', 'M3U payloads must be recognizable when Plex returns an unexpected body');
assert.strictEqual(Probe.classifyPayload(new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])), 'isobmff', 'fMP4/ISOBMFF payloads must be recognizable');


assert.strictEqual(typeof Probe.parsePlaylist, 'function', 'debug timing probe must expose HLS playlist parsing');
var masterPlaylist = Probe.parsePlaylist([
  '#EXTM3U',
  '#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080',
  'media/main.m3u8?X-Plex-Token=secret'
].join('\n'));
assert.strictEqual(masterPlaylist.kind, 'master', 'EXT-X-STREAM-INF must identify a master playlist');
assert.strictEqual(masterPlaylist.firstVariantUri, 'media/main.m3u8?X-Plex-Token=secret', 'master parsing must retain the first variant URI for the internal fetch');
var mediaPlaylist = Probe.parsePlaylist([
  '#EXTM3U',
  '#EXT-X-MEDIA-SEQUENCE:17',
  '#EXT-X-START:TIME-OFFSET=-3.5,PRECISE=YES',
  '#EXT-X-PROGRAM-DATE-TIME:2026-09-03T19:10:11.000Z',
  '#EXTINF:4.004,',
  'segment-17.ts?X-Plex-Token=secret',
  '#EXT-X-DISCONTINUITY',
  '#EXTINF:3.996,',
  'segment-18.ts?X-Plex-Token=secret'
].join('\n'));
assert.strictEqual(mediaPlaylist.kind, 'media', 'EXTINF entries must identify a media playlist');
assert.strictEqual(mediaPlaylist.mediaSequence, 17, 'media sequence must be captured');
assert.deepStrictEqual(mediaPlaylist.durations, [4.004, 3.996], 'segment EXTINF durations must be captured');
assert.strictEqual(mediaPlaylist.discontinuities, 1, 'discontinuities must be counted');
assert.strictEqual(mediaPlaylist.start.timeOffset, -3.5, 'EXT-X-START time offset must be parsed');
assert.strictEqual(mediaPlaylist.start.precise, true, 'EXT-X-START PRECISE=YES must be parsed');
assert.strictEqual(mediaPlaylist.programDateTime, '2026-09-03T19:10:11.000Z', 'first program date time must be retained');
assert.strictEqual(mediaPlaylist.firstSegmentUri, 'segment-17.ts?X-Plex-Token=secret', 'first media segment URI must be retained for probing');
assert.strictEqual(mediaPlaylist.startSegmentUri, 'segment-18.ts?X-Plex-Token=secret', 'EXT-X-START must select the media segment that contains the requested start position');
assert.strictEqual(mediaPlaylist.startSegmentIndex, 1, 'EXT-X-START segment index must be retained for diagnostics');
assert.strictEqual(mediaPlaylist.startSegmentOffset, 4.004, 'EXT-X-START segment offset must be derived from EXTINF durations');


assert.strictEqual(typeof Probe.parseTransportStreamTiming, 'function', 'debug timing probe must expose MPEG-TS timing parsing');
function encodeTimestamp(value, prefix) {
  return [
    (prefix << 4) | (Math.floor(value / 1073741824) % 8) * 2 | 1,
    Math.floor(value / 4194304) % 256,
    (Math.floor(value / 32768) % 128) * 2 | 1,
    Math.floor(value / 128) % 256,
    (value % 128) * 2 | 1
  ];
}
function tsPacket(pid, payloadUnitStart, payload) {
  var packet = new Uint8Array(188);
  var index;
  packet[0] = 0x47;
  packet[1] = (payloadUnitStart ? 0x40 : 0) | ((pid >> 8) & 0x1f);
  packet[2] = pid & 0xff;
  packet[3] = 0x10;
  for (index = 4; index < 188; index += 1) { packet[index] = 0xff; }
  for (index = 0; index < payload.length && index + 4 < 188; index += 1) { packet[index + 4] = payload[index]; }
  return packet;
}
function concatPackets(packets) {
  var result = new Uint8Array(packets.length * 188);
  var index;
  for (index = 0; index < packets.length; index += 1) { result.set(packets[index], index * 188); }
  return result;
}
var pmtPid = 0x100;
var videoPid = 0x101;
var pts90k = 491 * 90000;
var dts90k = 490.5 * 90000;
var pat = tsPacket(0, true, [
  0x00,
  0x00, 0xb0, 0x0d, 0x00, 0x01, 0xc1, 0x00, 0x00,
  0x00, 0x01, 0xe1, 0x00,
  0x00, 0x00, 0x00, 0x00
]);
var pmt = tsPacket(pmtPid, true, [
  0x00,
  0x02, 0xb0, 0x12, 0x00, 0x01, 0xc1, 0x00, 0x00,
  0xe1, 0x01, 0xf0, 0x00,
  0x1b, 0xe1, 0x01, 0xf0, 0x00,
  0x00, 0x00, 0x00, 0x00
]);
var pes = tsPacket(videoPid, true, [
  0x00, 0x00, 0x01, 0xe0, 0x00, 0x00, 0x80, 0xc0, 0x0a
].concat(encodeTimestamp(pts90k, 3), encodeTimestamp(dts90k, 1), [0x00, 0x00, 0x01, 0x09]));
var timing = Probe.parseTransportStreamTiming(concatPackets([pat, pmt, pes]));
assert.strictEqual(timing.ok, true, 'synthetic MPEG-TS PAT/PMT/PES fixture must yield timing');
assert.strictEqual(timing.pmtPid, pmtPid, 'PAT must identify the PMT PID');
assert.strictEqual(timing.videoPid, videoPid, 'PMT must identify the video PID');
assert.strictEqual(timing.streamType, 0x1b, 'PMT must retain the H.264 stream type');
assert.strictEqual(timing.pts90k, pts90k, 'PES parser must retain the first video PTS in 90 kHz units');
assert.strictEqual(timing.dts90k, dts90k, 'PES parser must retain DTS when present');
assert.strictEqual(timing.ptsSeconds, 491, 'PTS must be converted to seconds');
assert.strictEqual(timing.dtsSeconds, 490.5, 'DTS must be converted to seconds');
assert.deepStrictEqual(
  Probe.parseTransportStreamTiming(new Uint8Array([1, 2, 3, 4])),
  { ok: false, reason: 'not-ts' },
  'non-TS payloads must fail closed without throwing'
);


assert.strictEqual(typeof Probe.sanitizeUrl, 'function', 'debug timing probe must expose privacy-safe URL projection');
var sanitized = Probe.sanitizeUrl('http://192.168.10.20:32400/video/:/transcode/universal/start.m3u8?offset=491&X-Plex-Token=secret');
assert.strictEqual(sanitized, '.../start.m3u8', 'privacy-safe URL projection must retain only the bounded filename');
assert.strictEqual(sanitized.indexOf('192.168.'), -1, 'privacy-safe URL projection must not retain local addresses');
assert.strictEqual(sanitized.indexOf('secret'), -1, 'privacy-safe URL projection must not retain Plex tokens');
assert.strictEqual(
  Probe.sanitizeUrl('https://plex.example/video/:/transcode/universal/ploff-transcode-1788463-7/media-00017.ts?X-Plex-Token=abc'),
  '.../media-00017.ts',
  'segment projection must not retain transcode session path components'
);


var fs = require('fs');
var path = require('path');
var indexHtml = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
assert.strictEqual(/<script[^>]+src=["'][^"']*debug-timing-probe\.js/.test(indexHtml), false,
  'variant E must not add the heavy timing probe to the static startup script list');
assert.strictEqual(/PloffVariantEAutoProbe|start\('shadow1'\)|variant-e-probe-ready/.test(indexHtml), false,
  'retired HLS timing experiments must not run automatically during normal playback');

function makeRanges(values) {
  return {
    length: values.length,
    start: function (index) { return values[index][0]; },
    end: function (index) { return values[index][1]; }
  };
}
function makeVideo() {
  var listeners = {};
  return {
    currentTime: 0,
    duration: 1200,
    readyState: 0,
    networkState: 2,
    playbackRate: 1,
    paused: true,
    buffered: makeRanges([]),
    seekable: makeRanges([]),
    played: makeRanges([]),
    webkitDecodedFrameCount: 0,
    webkitDroppedFrameCount: 0,
    addEventListener: function (name, listener) {
      listeners[name] = listeners[name] || [];
      listeners[name].push(listener);
    },
    removeEventListener: function (name, listener) {
      var current = listeners[name] || [];
      listeners[name] = current.filter(function (entry) { return entry !== listener; });
    },
    emit: function (name) {
      (listeners[name] || []).slice().forEach(function (listener) { listener(); });
    }
  };
}
function makeRuntime(active) {
  var opens = [];
  var debugEvents = [];
  var video = makeVideo();
  function FakeXhr() {}
  FakeXhr.prototype.open = function (method, url) { opens.push({ method: method, url: url }); };
  FakeXhr.prototype.send = function () {};
  FakeXhr.prototype.abort = function () {};
  FakeXhr.prototype.setRequestHeader = function () {};
  var debugCapture = {
    active: active,
    isActive: function () { return this.active; },
    record: function (category, event, payload) {
      debugEvents.push({ category: category, event: event, payload: payload });
      return true;
    }
  };
  var root = {
    Date: Date,
    JSON: JSON,
    XMLHttpRequest: FakeXhr,
    PloffDebugCapture: debugCapture,
    document: {
      querySelector: function (selector) { return selector === 'video' ? video : null; }
    }
  };
  root.PloffClient = {
    preparePlayback: function (config, playback, options, callback) {
      var source = 'http://192.168.10.20:32400/video/:/transcode/universal/start.m3u8?offset=' + options.offset + '&copyts=0&session=main-session&transcodeSessionId=main-session&X-Plex-Session-Identifier=main-session&X-Plex-Token=secret';
      var xhr = new root.XMLHttpRequest();
      playback.sourceUrl = source;
      playback.hlsUrl = source;
      xhr.open('GET', source.replace('/start.m3u8?', '/decision?'));
      xhr.send();
      callback(null, source, 'direct-stream');
      return { abort: function () {} };
    }
  };
  return { root: root, video: video, opens: opens, debugEvents: debugEvents, debugCapture: debugCapture };
}
function assertRuntimeMode(mode, expectedCopyts) {
  var runtime = makeRuntime(true);
  var originalPrepare = runtime.root.PloffClient.preparePlayback;
  var originalOpen = runtime.root.XMLHttpRequest.prototype.open;
  var originalRecord = runtime.root.PloffDebugCapture.record;
  var instance = Probe.create({ root: runtime.root, requestText: function () { return { abort: function () {} }; }, requestBytes: function () { return { abort: function () {} }; } });
  var callbackUrl = '';
  var playback = {};
  assert.strictEqual(instance.start(mode), true, 'timing probe must start for copyts mode ' + mode);
  runtime.root.PloffDebugCapture.record('playback', 'source-prepare-start', {
    playbackGeneration: 1,
    sourceGeneration: 3,
    recoveryGeneration: 44,
    recoveryTarget: 491,
    offsetBase: 491,
    delivery: 'direct-stream'
  });
  runtime.root.PloffClient.preparePlayback({}, playback, { delivery: 'direct-stream', offset: 491 }, function (error, url) {
    assert.ifError(error);
    callbackUrl = url;
  });
  if (expectedCopyts === 'omit') {
    assert.strictEqual(callbackUrl.indexOf('copyts='), -1, 'source URL must omit copyts in omitted mode');
    assert.strictEqual(runtime.opens[0].url.indexOf('copyts='), -1, 'decision URL must omit copyts in omitted mode');
  } else {
    assert.ok(callbackUrl.indexOf('copyts=' + expectedCopyts) !== -1, 'source URL must carry the selected copyts mode');
    assert.ok(runtime.opens[0].url.indexOf('copyts=' + expectedCopyts) !== -1, 'decision URL must carry the selected copyts mode');
  }
  instance.stop();
  assert.strictEqual(runtime.root.PloffClient.preparePlayback, originalPrepare, 'stop must restore Plex preparePlayback');
  assert.strictEqual(runtime.root.XMLHttpRequest.prototype.open, originalOpen, 'stop must restore XMLHttpRequest.open');
  assert.strictEqual(runtime.root.PloffDebugCapture.record, originalRecord, 'stop must restore debug capture record');
}
assertRuntimeMode('0', '0');
assertRuntimeMode('omit', 'omit');
assertRuntimeMode('1', '1');

(function shadowModeLeavesPlaybackUntouchedAndProbesAnIsolatedCopyts1Source() {
  var runtime = makeRuntime(true);
  var textRequests = [];
  var instance = Probe.create({
    root: runtime.root,
    wallNow: function () { return 1788474000000; },
    requestText: function (url) { textRequests.push(url); return { abort: function () {} }; },
    requestBytes: function () { return { abort: function () {} }; }
  });
  var callbackUrl = '';
  assert.strictEqual(instance.start('shadow1'), true, 'variant E shadow mode must start with active capture');
  runtime.root.PloffDebugCapture.record('playback', 'source-prepare-start', {
    playbackGeneration: 5, sourceGeneration: 1, recoveryGeneration: 60, recoveryTarget: 551, offsetBase: 551, delivery: 'direct-stream'
  });
  runtime.root.PloffClient.preparePlayback({}, {}, { delivery: 'direct-stream', offset: 551 }, function (error, url) {
    assert.ifError(error); callbackUrl = url;
  });
  assert.ok(/copyts=0/.test(callbackUrl), 'shadow mode must not alter the URL applied to the real player');
  assert.ok(/copyts=0/.test(runtime.opens[0].url), 'shadow mode must not alter the real Plex decision request');
  runtime.root.PloffDebugCapture.record('playback', 'source-applied', {
    playbackGeneration: 5, sourceGeneration: 2, recoveryGeneration: 60, recoveryTarget: 551, offsetBase: 551, delivery: 'direct-stream', action: 'rebuild'
  });
  assert.strictEqual(textRequests.length, 1, 'shadow mode must begin one independent playlist probe for the applied source');
  assert.ok(/copyts=1/.test(textRequests[0]), 'shadow probe must request preserved timestamps');
  assert.strictEqual(/session=main-session/.test(textRequests[0]), false, 'shadow probe must not reuse the playback transcode session');
  instance.stop();
}());

var inactiveRuntime = makeRuntime(false);
var inactiveOriginalPrepare = inactiveRuntime.root.PloffClient.preparePlayback;
var inactiveProbe = Probe.create({ root: inactiveRuntime.root });
assert.strictEqual(inactiveProbe.start('1'), false, 'probe must refuse to patch runtime unless manual debug capture is already active');
assert.strictEqual(inactiveRuntime.root.PloffClient.preparePlayback, inactiveOriginalPrepare, 'failed debug-only start must leave normal playback untouched');


var probeRuntime = makeRuntime(true);
var textRequests = [];
var byteRequests = [];
var nowValue = 1000;
var probeInstance = Probe.create({
  root: probeRuntime.root,
  now: function () { nowValue += 5; return nowValue; },
  wallNow: function () { return 1788463000000 + nowValue; },
  requestText: function (url, callback) {
    textRequests.push(url);
    if (textRequests.length === 1) {
      callback(null, [
        '#EXTM3U',
        '#EXT-X-STREAM-INF:BANDWIDTH=8000000',
        'media/main.m3u8?X-Plex-Token=secret'
      ].join('\n'), 200);
    } else {
      callback(null, [
        '#EXTM3U',
        '#EXT-X-MEDIA-SEQUENCE:44',
        '#EXT-X-START:TIME-OFFSET=0,PRECISE=YES',
        '#EXT-X-PROGRAM-DATE-TIME:2026-09-03T19:10:11.000Z',
        '#EXTINF:4.000,',
        'segment-44.ts?X-Plex-Token=secret',
        '#EXT-X-DISCONTINUITY',
        '#EXTINF:4.000,',
        'segment-45.ts?X-Plex-Token=secret'
      ].join('\n'), 200);
    }
    return { abort: function () {} };
  },
  requestBytes: function (url, callback) {
    byteRequests.push(url);
    callback(null, concatPackets([pat, pmt, pes]), 206);
    return { abort: function () {} };
  }
});
assert.strictEqual(probeInstance.start('1'), true, 'full timing probe must start with active manual capture');
probeRuntime.root.PloffDebugCapture.record('playback', 'source-prepare-start', {
  playbackGeneration: 1,
  sourceGeneration: 3,
  recoveryGeneration: 44,
  recoveryTarget: 491,
  offsetBase: 491,
  delivery: 'direct-stream'
});
probeRuntime.root.PloffClient.preparePlayback({}, {}, { delivery: 'direct-stream', offset: 491 }, function () {});
probeRuntime.root.PloffDebugCapture.record('playback', 'source-applied', {
  playbackGeneration: 1,
  sourceGeneration: 4,
  recoveryGeneration: 44,
  recoveryTarget: 491,
  offsetBase: 491,
  delivery: 'direct-stream',
  action: 'rebuild'
});
assert.strictEqual(textRequests.length, 2, 'one source generation must fetch the master and one media playlist exactly once');
assert.strictEqual(byteRequests.length, 1, 'one source generation must inspect exactly one first media segment');
probeRuntime.video.readyState = 1;
probeRuntime.video.emit('loadedmetadata');
probeRuntime.video.emit('durationchange');
probeRuntime.video.readyState = 4;
probeRuntime.video.paused = false;
probeRuntime.video.emit('canplay');
probeRuntime.video.emit('playing');
probeRuntime.video.currentTime = 0.083;
probeRuntime.video.buffered = makeRanges([[0, 4]]);
probeRuntime.video.seekable = makeRanges([[0, 8]]);
probeRuntime.video.played = makeRanges([[0, 0.083]]);
probeRuntime.video.webkitDecodedFrameCount = 2;
probeRuntime.video.emit('timeupdate');
probeRuntime.video.emit('waiting');
probeRuntime.video.emit('stalled');
var repeatedIndex;
for (repeatedIndex = 0; repeatedIndex < 20; repeatedIndex += 1) {
  probeRuntime.video.currentTime += 0.2;
  probeRuntime.video.emit('timeupdate');
}
var exportedProbe = probeInstance.export();
assert.strictEqual(exportedProbe.schema, 1, 'timing probe export must be versioned');
assert.strictEqual(exportedProbe.copytsMode, '1', 'timing probe export must identify the active copyts variant');
assert.strictEqual(exportedProbe.sources.length, 1, 'one applied source generation must produce one timing record');
assert.strictEqual(exportedProbe.sources[0].playbackGeneration, 1, 'probe must retain playback generation');
assert.strictEqual(exportedProbe.sources[0].sourceGeneration, 4, 'probe must retain source generation');
assert.strictEqual(exportedProbe.sources[0].recoveryGeneration, 44, 'probe must retain recovery generation');
assert.strictEqual(exportedProbe.sources[0].target, 491, 'probe must retain the absolute recovery target');
assert.strictEqual(exportedProbe.sources[0].plexOffset, 491, 'probe must retain the offset sent to Plex');
assert.strictEqual(exportedProbe.sources[0].offsetBase, 491, 'probe must retain the active Ploff offset base');
assert.strictEqual(exportedProbe.sources[0].delivery, 'direct-stream', 'probe must retain delivery mode');
assert.strictEqual(exportedProbe.sources[0].sourceUri, '.../start.m3u8', 'source URL export must be privacy-safe');
assert.strictEqual(exportedProbe.sources[0].playlist.master.kind, 'master', 'master playlist summary must be captured');
assert.strictEqual(exportedProbe.sources[0].playlist.media.mediaSequence, 44, 'media playlist sequence must be captured');
assert.deepStrictEqual(exportedProbe.sources[0].playlist.media.durations, [4, 4], 'media playlist durations must be captured');
assert.strictEqual(exportedProbe.sources[0].playlist.media.discontinuities, 1, 'media playlist discontinuities must be captured');
assert.strictEqual(exportedProbe.sources[0].playlist.media.programDateTime, '2026-09-03T19:10:11.000Z', 'program date time must be captured');
assert.strictEqual(exportedProbe.sources[0].segment.uri, '.../segment-44.ts', 'segment URI export must be privacy-safe');
assert.strictEqual(exportedProbe.sources[0].segment.timing.ptsSeconds, 491, 'first segment video PTS must be exported');
assert.strictEqual(exportedProbe.sources[0].segment.timing.dtsSeconds, 490.5, 'first segment video DTS must be exported');
assert.strictEqual(exportedProbe.sources[0].segment.ptsMinusTarget, 0, 'PTS delta against the requested target must be derived');
assert.strictEqual(exportedProbe.sources[0].segment.ptsMinusOffsetBase, 0, 'PTS delta against offsetBase must be derived');
assert.strictEqual(exportedProbe.sources[0].mediaEvents.filter(function (entry) { return entry.event === 'first-advance'; }).length, 1, 'first real currentTime advance must be captured once');
assert.ok(exportedProbe.sources[0].mediaEvents.some(function (entry) { return entry.event === 'waiting'; }), 'waiting media state must be captured');
assert.ok(exportedProbe.sources[0].mediaEvents.some(function (entry) { return entry.event === 'stalled'; }), 'stalled media state must be captured');
assert.strictEqual(exportedProbe.sources[0].mediaEvents.filter(function (entry) { return entry.event === 'timeupdate'; }).length, 8, 'timeupdate sampling must stay bounded per source generation');
assert.strictEqual(exportedProbe.sources[0].mediaEvents.filter(function (entry) { return entry.event === 'timeupdate'; })[0].decodedFrames, 2, 'available decoder counters must be captured without being required');
var exportedJson = JSON.stringify(exportedProbe);
assert.strictEqual(exportedJson.indexOf('secret'), -1, 'timing export must never retain Plex tokens');
assert.strictEqual(exportedJson.indexOf('192.168.10.20'), -1, 'timing export must never retain local server addresses');
probeRuntime.root.PloffDebugCapture.record('playback', 'source-applied', {
  playbackGeneration: 1,
  sourceGeneration: 4,
  recoveryGeneration: 44,
  recoveryTarget: 491,
  offsetBase: 491,
  delivery: 'direct-stream',
  action: 'rebuild'
});
assert.strictEqual(textRequests.length, 2, 'duplicate source-applied events for one generation must not re-probe HLS');
assert.strictEqual(byteRequests.length, 1, 'duplicate source-applied events for one generation must not re-fetch the segment');
probeInstance.stop();

(function nonTsPayloadExportsOnlySafeDiagnostics() {
  var runtime = makeRuntime(true);
  var requests = 0;
  var instance = Probe.create({
    root: runtime.root,
    requestText: function (url, callback) {
      requests += 1;
      if (requests === 1) { callback(null, '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmedia.m3u8', 200); }
      else { callback(null, '#EXTM3U\n#EXTINF:10,\n00000.ts', 200); }
      return { abort: function () {} };
    },
    requestBytes: function (url, callback) {
      callback(null, new Uint8Array([0x23,0x45,0x58,0x54,0x4d,0x33,0x55]).buffer, 200, {
        contentType: 'application/vnd.apple.mpegurl', contentEncoding: '', byteLength: 7
      });
      return { abort: function () {} };
    }
  });
  assert.strictEqual(instance.start('shadow1'), true, 'safe payload diagnostics test must start');
  runtime.root.PloffDebugCapture.record('playback', 'source-prepare-start', {
    playbackGeneration: 6, sourceGeneration: 1, recoveryGeneration: 61, recoveryTarget: 491, offsetBase: 491, delivery: 'direct-stream'
  });
  runtime.root.PloffClient.preparePlayback({}, {}, { delivery: 'direct-stream', offset: 491 }, function () {});
  runtime.root.PloffDebugCapture.record('playback', 'source-applied', {
    playbackGeneration: 6, sourceGeneration: 2, recoveryGeneration: 61, recoveryTarget: 491, offsetBase: 491, delivery: 'direct-stream', action: 'rebuild'
  });
  var exported = instance.export();
  assert.strictEqual(exported.sources[0].segment.payloadKind, 'playlist', 'unexpected segment bodies must be classified');
  assert.strictEqual(exported.sources[0].segment.byteLength, 7, 'unexpected segment body size must be retained');
  assert.strictEqual(exported.sources[0].segment.contentType, 'application/vnd.apple.mpegurl', 'safe response metadata must be retained');
  assert.strictEqual(JSON.stringify(exported).indexOf('#EXTM3U'), -1, 'raw unexpected payload content must never be exported');
  instance.stop();
}());

(function shadowProbeUsesExtXStartSegmentInsteadOfPlaylistSegmentZero() {
  var runtime = makeRuntime(true);
  var requestedSegmentUrls = [];
  var instance = Probe.create({
    root: runtime.root,
    requestText: function (url, callback) {
      if (/start\.m3u8/.test(url)) { callback(null, '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmedia.m3u8', 200); }
      else { callback(null, '#EXTM3U\n#EXT-X-START:TIME-OFFSET=15,PRECISE=NO\n#EXTINF:10,\n00000.ts\n#EXTINF:10,\n00001.ts\n#EXTINF:10,\n00002.ts', 200); }
      return { abort: function () {} };
    },
    requestBytes: function (url, callback) {
      requestedSegmentUrls.push(url);
      callback(null, concatPackets([pat, pmt, pes]), 206, { contentType: 'video/mp2t' });
      return { abort: function () {} };
    }
  });
  assert.strictEqual(instance.start('shadow1'), true, 'EXT-X-START shadow segment test must start');
  runtime.root.PloffDebugCapture.record('playback', 'source-prepare-start', {
    playbackGeneration: 9, sourceGeneration: 1, recoveryGeneration: 90, recoveryTarget: 15, offsetBase: 15, delivery: 'direct-stream'
  });
  runtime.root.PloffClient.preparePlayback({}, {}, { delivery: 'direct-stream', offset: 15 }, function () {});
  runtime.root.PloffDebugCapture.record('playback', 'source-applied', {
    playbackGeneration: 9, sourceGeneration: 2, recoveryGeneration: 90, recoveryTarget: 15, offsetBase: 15, delivery: 'direct-stream', action: 'rebuild'
  });
  assert.ok(requestedSegmentUrls.some(function (url) { return /00001\.ts/.test(url); }), 'shadow timing probe must fetch the segment containing EXT-X-START');
  assert.ok(requestedSegmentUrls.some(function (url) { return /00000\.ts/.test(url); }), 'shadow timing probe must also fetch an earlier segment for transport timestamp calibration');
  var exported = instance.export();
  assert.strictEqual(exported.sources[0].segment.playlistStartOffset, 15, 'export must retain the requested playlist start offset');
  assert.strictEqual(exported.sources[0].segment.segmentStartOffset, 10, 'export must retain the selected segment start offset');
  assert.strictEqual(exported.sources[0].segment.segmentIndex, 1, 'export must retain the selected segment index');
  instance.stop();
}());


(function shadowProbeCalibratesPreservedTransportTimestamps() {
  var runtime = makeRuntime(true);
  var requestedUrls = [];
  function pesPacket(ptsSeconds, dtsSeconds) {
    return tsPacket(videoPid, true, [
      0x00, 0x00, 0x01, 0xe0, 0x00, 0x00, 0x80, 0xc0, 0x0a
    ].concat(encodeTimestamp(Math.round(ptsSeconds * 90000), 3), encodeTimestamp(Math.round(dtsSeconds * 90000), 1), [0x00, 0x00, 0x01, 0x09]));
  }
  var selectedTs = concatPackets([pat, pmt, pesPacket(28.637, 28.554)]);
  var calibrationTs = concatPackets([pat, pmt, pesPacket(18.637, 18.554)]);
  var instance = Probe.create({
    root: runtime.root,
    requestText: function (url, callback) {
      if (/start\.m3u8/.test(url)) { callback(null, '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmedia.m3u8', 200); }
      else { callback(null, '#EXTM3U\n#EXT-X-START:TIME-OFFSET=21,PRECISE=NO\n#EXTINF:10,\n00000.ts\n#EXTINF:10,\n00001.ts\n#EXTINF:10,\n00002.ts\n#EXTINF:10,\n00003.ts', 200); }
      return { abort: function () {} };
    },
    requestBytes: function (url, callback) {
      requestedUrls.push(url);
      if (/00002\.ts/.test(url)) { callback(null, selectedTs, 206, { contentType: 'video/mp2t' }); }
      else if (/00000\.ts/.test(url)) { callback(null, new Uint8Array(0).buffer, 200, { contentType: 'application/octet-stream', byteLength: 0 }); }
      else if (/00001\.ts/.test(url)) { callback(null, calibrationTs, 206, { contentType: 'video/mp2t' }); }
      else { callback('unexpected-segment', null, 404, {}); }
      return { abort: function () {} };
    }
  });
  assert.strictEqual(instance.start('shadow1'), true, 'transport calibration test must start');
  runtime.root.PloffDebugCapture.record('playback', 'source-prepare-start', {
    playbackGeneration: 10, sourceGeneration: 1, recoveryGeneration: 100, recoveryTarget: 21, offsetBase: 21, delivery: 'direct-stream'
  });
  runtime.root.PloffClient.preparePlayback({}, {}, { delivery: 'direct-stream', offset: 21 }, function () {});
  runtime.root.PloffDebugCapture.record('playback', 'source-applied', {
    playbackGeneration: 10, sourceGeneration: 2, recoveryGeneration: 100, recoveryTarget: 21, offsetBase: 21, delivery: 'direct-stream', action: 'rebuild'
  });
  runtime.video.currentTime = 0.083;
  runtime.video.paused = false;
  runtime.video.emit('playing');
  var exported = instance.export();
  assert.ok(requestedUrls.some(function (url) { return /00002\.ts/.test(url); }), 'selected EXT-X-START segment must still be probed');
  assert.strictEqual(exported.sources[0].calibration.segmentIndex, 1, 'calibration must skip an empty segment zero and use the first valid TS');
  assert.strictEqual(exported.sources[0].calibration.segmentStartOffset, 10, 'calibration must retain the logical media offset of its segment');
  assert.ok(Math.abs(exported.sources[0].calibration.transportDtsOffset - 8.554) < 0.0001, 'calibration must derive the preserved transport timestamp origin from DTS');
  assert.ok(Math.abs(exported.sources[0].segment.calibratedPtsSeconds - 20.083) < 0.0001, 'selected PTS must be projected back onto the media timeline');
  assert.ok(Math.abs(exported.sources[0].segment.transportDtsDrift) < 0.0001, 'selected segment DTS offset must be comparable with the calibrated transport origin');
  assert.ok(Math.abs(exported.sources[0].segment.calibratedPtsMinusPloffAtFirstAdvance + 1) < 0.0001, 'calibrated media PTS must expose the real one-second anchor error instead of raw TS offset');
  instance.stop();
}());

(function emptyShadowSegmentRetriesAfterCanplayAndCapturesTiming() {
  var runtime = makeRuntime(true);
  var byteRequests = 0;
  var instance = Probe.create({
    root: runtime.root,
    requestText: function (url, callback) {
      if (/start\.m3u8/.test(url)) { callback(null, '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmedia.m3u8', 200); }
      else { callback(null, '#EXTM3U\n#EXTINF:10,\n00000.ts', 200); }
      return { abort: function () {} };
    },
    requestBytes: function (url, callback) {
      byteRequests += 1;
      if (byteRequests === 1) {
        callback(null, new Uint8Array(0).buffer, 200, { contentType: 'application/octet-stream', byteLength: 0 });
      } else {
        callback(null, concatPackets([pat, pmt, pes]), 206, { contentType: 'video/mp2t' });
      }
      return { abort: function () {} };
    }
  });
  assert.strictEqual(instance.start('shadow1'), true, 'shadow retry test must start');
  runtime.root.PloffDebugCapture.record('playback', 'source-prepare-start', {
    playbackGeneration: 7, sourceGeneration: 1, recoveryGeneration: 70, recoveryTarget: 491, offsetBase: 491, delivery: 'direct-stream'
  });
  runtime.root.PloffClient.preparePlayback({}, {}, { delivery: 'direct-stream', offset: 491 }, function () {});
  runtime.root.PloffDebugCapture.record('playback', 'source-applied', {
    playbackGeneration: 7, sourceGeneration: 2, recoveryGeneration: 70, recoveryTarget: 491, offsetBase: 491, delivery: 'direct-stream', action: 'rebuild'
  });
  assert.strictEqual(byteRequests, 1, 'first shadow segment fetch must still happen immediately');
  assert.strictEqual(instance.export().sources[0].segment.payloadKind, 'empty', 'initial empty segment response must be retained as evidence');
  runtime.video.readyState = 4;
  runtime.video.emit('canplay');
  assert.strictEqual(byteRequests, 2, 'canplay must retry one failed shadow segment fetch');
  assert.strictEqual(instance.export().sources[0].segment.timing.ptsSeconds, 491, 'retry must capture the first usable video PTS');
  assert.strictEqual(instance.export().sources[0].segment.attemptCount, 2, 'export must report how many bounded segment attempts were required');
  runtime.video.emit('playing');
  runtime.video.emit('timeupdate');
  assert.strictEqual(byteRequests, 2, 'successful timing capture must stop further segment retries');
  instance.stop();
}());

(function shadowSegmentRetriesStayBounded() {
  var runtime = makeRuntime(true);
  var byteRequests = 0;
  var instance = Probe.create({
    root: runtime.root,
    requestText: function (url, callback) {
      if (/start\.m3u8/.test(url)) { callback(null, '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmedia.m3u8', 200); }
      else { callback(null, '#EXTM3U\n#EXTINF:10,\n00000.ts', 200); }
      return { abort: function () {} };
    },
    requestBytes: function (url, callback) {
      byteRequests += 1;
      callback(null, new Uint8Array(0).buffer, 200, { contentType: 'application/octet-stream', byteLength: 0 });
      return { abort: function () {} };
    }
  });
  assert.strictEqual(instance.start('shadow1'), true, 'bounded shadow retry test must start');
  runtime.root.PloffDebugCapture.record('playback', 'source-prepare-start', {
    playbackGeneration: 8, sourceGeneration: 1, recoveryGeneration: 80, recoveryTarget: 491, offsetBase: 491, delivery: 'direct-stream'
  });
  runtime.root.PloffClient.preparePlayback({}, {}, { delivery: 'direct-stream', offset: 491 }, function () {});
  runtime.root.PloffDebugCapture.record('playback', 'source-applied', {
    playbackGeneration: 8, sourceGeneration: 2, recoveryGeneration: 80, recoveryTarget: 491, offsetBase: 491, delivery: 'direct-stream', action: 'rebuild'
  });
  runtime.video.emit('canplay');
  runtime.video.emit('playing');
  runtime.video.emit('timeupdate');
  runtime.video.emit('timeupdate');
  runtime.video.emit('timeupdate');
  assert.strictEqual(byteRequests, 4, 'shadow segment probing must stop after four total attempts');
  assert.strictEqual(instance.export().sources[0].segment.attemptCount, 4, 'bounded retry count must be exported');
  instance.stop();
}());

var cleanupRuntime = makeRuntime(true);
var cleanupAbortCount = 0;
var cleanupProbe = Probe.create({
  root: cleanupRuntime.root,
  requestText: function () {
    return { abort: function () { cleanupAbortCount += 1; } };
  },
  requestBytes: function () {
    return { abort: function () { cleanupAbortCount += 1; } };
  }
});
assert.strictEqual(cleanupProbe.start('0'), true, 'cleanup probe must start');
cleanupRuntime.root.PloffDebugCapture.record('playback', 'source-prepare-start', {
  playbackGeneration: 2,
  sourceGeneration: 7,
  recoveryGeneration: 50,
  recoveryTarget: 600,
  offsetBase: 600,
  delivery: 'direct-stream'
});
cleanupRuntime.root.PloffClient.preparePlayback({}, {}, { delivery: 'direct-stream', offset: 600 }, function () {});
cleanupRuntime.root.PloffDebugCapture.record('playback', 'source-applied', {
  playbackGeneration: 2,
  sourceGeneration: 8,
  recoveryGeneration: 50,
  recoveryTarget: 600,
  offsetBase: 600,
  delivery: 'direct-stream',
  action: 'rebuild'
});
assert.strictEqual(cleanupProbe.status().pendingRequests, 1, 'an in-flight playlist probe must be tracked');
cleanupProbe.stop();
assert.strictEqual(cleanupAbortCount, 1, 'stop must abort each in-flight probe request exactly once');
assert.strictEqual(cleanupProbe.status().pendingRequests, 0, 'stop must clear tracked probe requests');

var lateRuntime = makeRuntime(true);
var latePlaylistCallback = null;
var lateRequestCount = 0;
var lateProbe = Probe.create({
  root: lateRuntime.root,
  requestText: function (url, callback) {
    lateRequestCount += 1;
    latePlaylistCallback = callback;
    return { abort: function () {} };
  },
  requestBytes: function () { throw new Error('late callback test must not reach segment fetch'); }
});
assert.strictEqual(lateProbe.start('1'), true, 'late-callback probe must start');
lateRuntime.root.PloffDebugCapture.record('playback', 'source-prepare-start', {
  playbackGeneration: 3,
  sourceGeneration: 9,
  recoveryGeneration: 51,
  recoveryTarget: 700,
  offsetBase: 700,
  delivery: 'direct-stream'
});
lateRuntime.root.PloffClient.preparePlayback({}, {}, { delivery: 'direct-stream', offset: 700 }, function () {});
lateRuntime.root.PloffDebugCapture.record('playback', 'source-applied', {
  playbackGeneration: 3,
  sourceGeneration: 10,
  recoveryGeneration: 51,
  recoveryTarget: 700,
  offsetBase: 700,
  delivery: 'direct-stream',
  action: 'rebuild'
});
assert.strictEqual(lateRequestCount, 1, 'source probe must have one in-flight master playlist request');
lateProbe.stop();
latePlaylistCallback(null, [
  '#EXTM3U',
  '#EXT-X-STREAM-INF:BANDWIDTH=8000000',
  'media/main.m3u8?X-Plex-Token=late-secret'
].join('\n'), 200);
assert.strictEqual(lateRequestCount, 1, 'callbacks arriving after stop must not start follow-up requests');
assert.strictEqual(lateProbe.export().sources[0].playlist.master, null, 'callbacks arriving after stop must not mutate the exported capture');

var restartRuntime = makeRuntime(true);
var restartCallbacks = [];
var restartRequestCount = 0;
var restartProbe = Probe.create({
  root: restartRuntime.root,
  requestText: function (url, callback) {
    restartRequestCount += 1;
    restartCallbacks.push(callback);
    return { abort: function () {} };
  },
  requestBytes: function () { return { abort: function () {} }; }
});
assert.strictEqual(restartProbe.start('0'), true, 'restart probe first run must start');
restartRuntime.root.PloffDebugCapture.record('playback', 'source-prepare-start', {
  playbackGeneration: 4,
  sourceGeneration: 11,
  recoveryGeneration: 52,
  recoveryTarget: 800,
  offsetBase: 800,
  delivery: 'direct-stream'
});
restartRuntime.root.PloffClient.preparePlayback({}, {}, { delivery: 'direct-stream', offset: 800 }, function () {});
restartRuntime.root.PloffDebugCapture.record('playback', 'source-applied', {
  playbackGeneration: 4,
  sourceGeneration: 12,
  recoveryGeneration: 52,
  recoveryTarget: 800,
  offsetBase: 800,
  delivery: 'direct-stream',
  action: 'rebuild'
});
assert.strictEqual(restartRequestCount, 1, 'first run must have one in-flight request');
restartProbe.stop();
assert.strictEqual(restartProbe.start('1'), true, 'restart probe second run must start');
restartCallbacks[0](null, [
  '#EXTM3U',
  '#EXT-X-STREAM-INF:BANDWIDTH=8000000',
  'media/main.m3u8?X-Plex-Token=stale-secret'
].join('\n'), 200);
assert.strictEqual(restartRequestCount, 1, 'callbacks from a previous probe run must stay inert after restart');
restartProbe.stop();

console.log('Debug timing probe checks passed');
