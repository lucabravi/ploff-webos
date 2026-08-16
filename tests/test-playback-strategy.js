'use strict';

var assert = require('assert');
var PlaybackStrategy = require('../app/playback-strategy');

var versions = [
  { mediaIndex: 0, partIndex: 0, videoCodec: 'h264', container: 'mp4', width: 1920, height: 1080, videoDynamicRange: '' },
  { mediaIndex: 1, partIndex: 0, videoCodec: 'hevc', container: 'mkv', width: 3840, height: 2160, videoDynamicRange: 'HDR10' }
];

var capable = { directPlay: true, codecs: ['h264', 'hevc'], containers: ['mp4', 'mkv'], uhd: true, hdr10: true };
var autoPlan = PlaybackStrategy.plan('auto', capable, versions, 1, 'original', ['resolution', 'hdr', 'quality', 'directPlay']);
assert.deepStrictEqual(autoPlan.map(function (step) { return step.kind; }), [
  'direct-play', 'direct-stream', 'transcode', 'safe-transcode'
], 'Auto must try compatible direct playback before bounded Plex fallbacks');
assert.strictEqual(autoPlan[0].mediaIndex, 1, 'an explicit compatible version must remain selected');
assert.strictEqual(autoPlan[3].videoQuality, '8000', 'the final safe fallback must be bounded to 1080p-friendly bitrate');
assert.strictEqual(autoPlan[3].videoResolution, '1920x1080', 'the final safe fallback must also cap resolution to 1080p');

var directPlayKnownBad = {
  shouldSkip: function (request) { return request.kind === 'direct-play'; }
};
var memoryPlan = PlaybackStrategy.plan('auto', capable, versions, 1, 'original', directPlayKnownBad, {
  serverIdentity: 'server-1',
  mediaIdentity: 'episode-1',
  enabled: true
});
assert.deepStrictEqual(memoryPlan.map(function (step) { return step.kind; }), [
  'direct-stream', 'transcode', 'safe-transcode'
], 'automatic playback must skip only the remembered Direct Play failure');
var forcedMemoryPlan = PlaybackStrategy.plan('direct', capable, versions, 1, 'original', directPlayKnownBad, {
  enabled: true
});
assert.deepStrictEqual(forcedMemoryPlan.map(function (step) { return step.kind; }), ['direct-play', 'direct-stream'], 'forced Direct mode must ignore compatibility memory');

var noHdr = PlaybackStrategy.plan('auto', {
  directPlay: true, codecs: ['h264', 'hevc'], containers: ['mp4', 'mkv'], uhd: true, hdr10: false
}, versions, 1, 'original');
assert.strictEqual(noHdr[0].kind, 'transcode', 'Auto must transcode the selected source instead of silently replacing it with a lower Direct Play version');
assert.strictEqual(noHdr[0].mediaIndex, 1, 'Auto fallback must preserve the source selected by the configured version policy');

var unlistedNativeFormat = PlaybackStrategy.plan('auto', {
  directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false
}, [{
  mediaIndex: 0, partIndex: 0, videoCodec: 'av1', container: 'webm', width: 1920, height: 1080, videoDynamicRange: ''
}], 0, 'original');
assert.deepStrictEqual(unlistedNativeFormat.map(function (step) { return step.kind; }), [
  'direct-play', 'direct-stream', 'transcode', 'safe-transcode'
], 'Automatic playback must probe native delivery before giving up on a format that is not in the conservative capability list');

var selectedTracks = PlaybackStrategy.plan('auto', {
  directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, tracksRequireTranscode: true
}, [versions[0]], 0, 'original');
assert.deepStrictEqual(selectedTracks.map(function (step) { return step.kind; }), [
  'transcode', 'safe-transcode', 'direct-play', 'direct-stream'
], 'Automatic playback must retain a native fallback when the selected audio or subtitle track prefers transcoding');

var directPlan = PlaybackStrategy.plan('direct', capable, versions, 1, 'original');
assert.deepStrictEqual(directPlan.map(function (step) { return step.kind; }), ['direct-play', 'direct-stream'], 'Direct-only mode must never silently transcode');
assert.deepStrictEqual(
  PlaybackStrategy.plan('direct', { directPlay: true, codecs: ['h264'], containers: ['mp4'], uhd: false, hdr10: false }, versions, 1, 'original'),
  [
    { kind: 'direct-play', mediaIndex: 1, partIndex: 0, videoQuality: 'original', videoResolution: '3840x2160' },
    { kind: 'direct-stream', mediaIndex: 1, partIndex: 0, videoQuality: 'original', videoResolution: '3840x2160' }
  ],
  'forced Direct mode must still try the selected source so the player can offer Automatic after a confirmed failure'
);
assert.strictEqual(
  PlaybackStrategy.compatible(
    { videoCodec: 'hevc', container: 'mkv', width: 3840, height: 2160, videoDynamicRange: 'Dolby Vision' },
    { directPlay: true, codecs: ['hevc'], containers: ['mkv'], uhd: true, hdr10: true, dolbyVision: false }
  ),
  false,
  'HDR10 support alone must not claim Direct Play compatibility with Dolby Vision'
);
assert.strictEqual(
  PlaybackStrategy.compatible(
    { videoCodec: 'hevc', container: 'mkv', width: 3840, height: 2160, videoDynamicRange: 'DV' },
    { directPlay: true, codecs: ['hevc'], containers: ['mkv'], uhd: true, hdr10: false, dolbyVision: true }
  ),
  true,
  'Dolby Vision sources must be directly playable on a reported Dolby Vision device'
);
assert.strictEqual(
  PlaybackStrategy.compatible(
    { videoCodec: 'hevc', container: 'mkv', width: 3840, height: 2160, videoDynamicRange: 'DOVI' },
    { directPlay: true, codecs: ['hevc'], containers: ['mkv'], uhd: true, hdr10: true, dolbyVision: false }
  ),
  false,
  'Plex DOVI metadata must be recognized as Dolby Vision instead of generic HDR10'
);

var transcodePlan = PlaybackStrategy.plan('transcode', capable, versions, 1, '12000');
assert.deepStrictEqual(transcodePlan.map(function (step) { return step.kind; }), ['transcode', 'safe-transcode'], 'forced transcode must skip direct attempts');
assert.strictEqual(transcodePlan[0].videoQuality, '12000', 'forced transcode must respect the requested quality ceiling');
assert.strictEqual(transcodePlan[0].safeTranscode, undefined, 'the primary transcode attempt must retain the requested profile');
assert.strictEqual(transcodePlan[1].safeTranscode, true, 'the bounded fallback must explicitly request the safe Plex transcode profile');

var hdTranscodePlan = PlaybackStrategy.plan('transcode', capable, [versions[0]], 0, 'original');
assert.strictEqual(hdTranscodePlan[0].videoResolution, '1920x1080', 'transcoding a 1080p source must not request a 4K ceiling');
var uhdTranscodePlan = PlaybackStrategy.plan('transcode', capable, [versions[1]], 0, 'original');
assert.strictEqual(uhdTranscodePlan[0].videoResolution, '3840x2160', 'a UHD device may keep a 4K transcode ceiling for a 4K source');
var hdDeviceTranscodePlan = PlaybackStrategy.plan('transcode', {
  directPlay: true, codecs: ['h264', 'hevc'], containers: ['mp4', 'mkv'], known: true, uhd: false, hdr10: false
}, [versions[1]], 0, 'original');
assert.strictEqual(hdDeviceTranscodePlan[0].videoResolution, '1920x1080', 'a 4K source must be capped for a non-UHD device');
var unknownDeviceTranscodePlan = PlaybackStrategy.plan('transcode', {
  directPlay: true, codecs: [], containers: [], known: false, uhd: false, hdr10: false
}, [versions[1]], 0, 'original');
assert.strictEqual(unknownDeviceTranscodePlan[0].videoResolution, '3840x2160', 'an unknown device should try the source UHD profile before its bounded fallback');

assert.strictEqual(PlaybackStrategy.next(autoPlan, 0).kind, 'direct-stream', 'recovery must advance exactly one bounded strategy');
assert.strictEqual(PlaybackStrategy.next(autoPlan, autoPlan.length - 1), null, 'recovery must stop after the final strategy');

console.log('Playback strategy checks passed');
