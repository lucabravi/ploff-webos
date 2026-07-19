'use strict';

var assert = require('assert');
var PlaybackStrategy = require('../shell/playback-strategy');

var versions = [
  { mediaIndex: 0, partIndex: 0, videoCodec: 'h264', container: 'mp4', width: 1920, height: 1080, videoDynamicRange: '' },
  { mediaIndex: 1, partIndex: 0, videoCodec: 'hevc', container: 'mkv', width: 3840, height: 2160, videoDynamicRange: 'HDR10' }
];

var capable = { directPlay: true, codecs: ['h264', 'hevc'], containers: ['mp4', 'mkv'], uhd: true, hdr10: true };
var autoPlan = PlaybackStrategy.plan('auto', capable, versions, 1, 'original');
assert.deepStrictEqual(autoPlan.map(function (step) { return step.kind; }), [
  'direct-play', 'direct-stream', 'transcode', 'safe-transcode'
], 'Auto must try compatible direct playback before bounded Plex fallbacks');
assert.strictEqual(autoPlan[0].mediaIndex, 1, 'an explicit compatible version must remain selected');
assert.strictEqual(autoPlan[3].videoQuality, '8000', 'the final safe fallback must be bounded to 1080p-friendly bitrate');
assert.strictEqual(autoPlan[3].videoResolution, '1920x1080', 'the final safe fallback must also cap resolution to 1080p');

var noHdr = PlaybackStrategy.plan('auto', {
  directPlay: true, codecs: ['h264', 'hevc'], containers: ['mp4', 'mkv'], uhd: true, hdr10: false
}, versions, 1, 'original');
assert.strictEqual(noHdr[0].kind, 'direct-play', 'Auto must retain a compatible direct-play attempt when another version is safe');
assert.strictEqual(noHdr[0].mediaIndex, 0, 'Auto must avoid an HDR direct-play version on a non-HDR device');

var directPlan = PlaybackStrategy.plan('direct', capable, versions, 1, 'original');
assert.deepStrictEqual(directPlan.map(function (step) { return step.kind; }), ['direct-play', 'direct-stream'], 'Direct-only mode must never silently transcode');

var transcodePlan = PlaybackStrategy.plan('transcode', capable, versions, 1, '12000');
assert.deepStrictEqual(transcodePlan.map(function (step) { return step.kind; }), ['transcode', 'safe-transcode'], 'forced transcode must skip direct attempts');
assert.strictEqual(transcodePlan[0].videoQuality, '12000', 'forced transcode must respect the requested quality ceiling');

assert.strictEqual(PlaybackStrategy.next(autoPlan, 0).kind, 'direct-stream', 'recovery must advance exactly one bounded strategy');
assert.strictEqual(PlaybackStrategy.next(autoPlan, autoPlan.length - 1), null, 'recovery must stop after the final strategy');

console.log('Playback strategy checks passed');
