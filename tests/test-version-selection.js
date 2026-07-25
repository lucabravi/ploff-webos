'use strict';

var assert = require('assert');
var VersionSelection = require('../app/version-selection');

var versions = [
  { mediaIndex: 0, partIndex: 0, videoCodec: 'h264', container: 'mp4', width: 1280, height: 720, bitrate: 5000, videoDynamicRange: '' },
  { mediaIndex: 1, partIndex: 0, videoCodec: 'hevc', container: 'mkv', width: 1920, height: 1080, bitrate: 4500, videoDynamicRange: '' },
  { mediaIndex: 2, partIndex: 0, videoCodec: 'hevc', container: 'mkv', width: 3840, height: 2160, bitrate: 18000, videoDynamicRange: 'HDR10' }
];
var hdCapabilities = { directPlay: true, codecs: ['h264'], containers: ['mp4'], uhd: false, hdr10: false };
var fullCapabilities = { directPlay: true, codecs: ['h264', 'hevc'], containers: ['mp4', 'mkv'], uhd: true, hdr10: true };
var explicitSdrCapabilities = { directPlay: true, codecs: ['h264', 'hevc'], containers: ['mp4', 'mkv'], uhd: true, hdr10: false, dolbyVision: false, hdrKnown: true };

assert.deepStrictEqual(
  VersionSelection.normalizePriorities(['hdr', 'resolution', 'hdr', 'unknown']),
  ['hdr', 'resolution', 'quality', 'directPlay'],
  'priority validation must preserve valid order, remove duplicates, and append missing criteria'
);
assert.strictEqual(VersionSelection.isPrioritySupported('hdr', explicitSdrCapabilities), false, 'HDR priority must be disabled on an explicitly SDR TV');
assert.strictEqual(VersionSelection.isPrioritySupported('hdr', { hdr10: false, dolbyVision: false, hdrKnown: false }), true, 'unknown legacy HDR capability must not be mistaken for explicit lack of support');
assert.deepStrictEqual(
  VersionSelection.effectivePriorities(['hdr', 'quality', 'resolution', 'directPlay'], explicitSdrCapabilities),
  ['quality', 'resolution', 'directPlay'],
  'unsupported HDR must remain stored but be removed from effective ranking'
);

var sameResolutionVersions = [
  { mediaIndex: 0, partIndex: 0, videoCodec: 'hevc', container: 'mkv', width: 1920, height: 1080, bitrate: 4000, videoDynamicRange: 'HDR10' },
  { mediaIndex: 1, partIndex: 0, videoCodec: 'h264', container: 'mp4', width: 1920, height: 1080, bitrate: 8000, videoDynamicRange: '' }
];
assert.strictEqual(
  VersionSelection.selectAutomatic(sameResolutionVersions, explicitSdrCapabilities, 'auto', ['hdr', 'quality', 'resolution', 'directPlay']).mediaIndex,
  1,
  'an SDR TV must ignore HDR priority and continue with the next configured criterion'
);

assert.strictEqual(
  VersionSelection.selectAutomatic(versions, fullCapabilities, 'auto', ['resolution', 'hdr', 'quality', 'directPlay']).mediaIndex,
  2,
  'automatic selection must prefer the highest resolution when resolution is the first criterion'
);
assert.strictEqual(
  VersionSelection.selectAutomatic(versions, hdCapabilities, 'direct', ['resolution', 'hdr', 'quality', 'directPlay']).mediaIndex,
  0,
  'direct-only selection must exclude versions the TV cannot play directly'
);
assert.strictEqual(
  VersionSelection.selectAutomatic(versions, hdCapabilities, 'transcode', ['resolution', 'hdr', 'quality', 'directPlay']).mediaIndex,
  2,
  'forced transcode must select the best source independently of direct-play compatibility'
);
assert.strictEqual(
  VersionSelection.selectAutomatic(versions, hdCapabilities, 'auto', ['directPlay', 'resolution', 'hdr', 'quality']).mediaIndex,
  0,
  'Auto must allow Direct Play to win when the user ranks it first'
);
assert.strictEqual(
  VersionSelection.select([
    { mediaIndex: 0, partIndex: 0, width: 1920, height: 1080 },
    { mediaIndex: 0, partIndex: 1, width: 1920, height: 1080 },
    { mediaIndex: 2, partIndex: 0, width: 1280, height: 720 }
  ], {
    explicitMediaIndex: 2,
    explicitPartIndex: 0,
    capabilities: fullCapabilities,
    mode: 'auto'
  }).mediaIndex,
  2,
  'manual selection must match Plex media and part indexes rather than the flattened array position'
);

var previous = VersionSelection.signature({
  videoCodec: 'hevc', container: 'mkv', width: 1920, height: 1080, bitrate: 4500, videoDynamicRange: ''
});
var nextVersions = [
  { mediaIndex: 0, partIndex: 0, videoCodec: 'h264', container: 'mp4', width: 720, height: 480, bitrate: 1800, videoDynamicRange: '' },
  { mediaIndex: 1, partIndex: 0, videoCodec: 'hevc', container: 'mkv', width: 1920, height: 1080, bitrate: 5000, videoDynamicRange: '' }
];
assert.strictEqual(
  VersionSelection.selectAffine(nextVersions, previous, fullCapabilities, 'auto', VersionSelection.DEFAULT_PRIORITIES).mediaIndex,
  1,
  'continuous playback must match technical characteristics instead of reusing an arbitrary numeric index'
);

var unrelated = [
  { mediaIndex: 0, partIndex: 0, videoCodec: 'h264', container: 'mp4', width: 1920, height: 1080, bitrate: 7000, videoDynamicRange: '' },
  { mediaIndex: 1, partIndex: 0, videoCodec: 'hevc', container: 'mkv', width: 3840, height: 2160, bitrate: 18000, videoDynamicRange: 'HDR10' }
];
var impossibleAffinity = VersionSelection.signature({
  videoCodec: 'mpeg2video', container: 'avi', width: 640, height: 360, bitrate: 800, videoDynamicRange: ''
});
assert.strictEqual(
  VersionSelection.selectAffine(unrelated, impossibleAffinity, fullCapabilities, 'auto', VersionSelection.DEFAULT_PRIORITIES).mediaIndex,
  1,
  'weak affinity must fall back to the configured automatic policy'
);

console.log('Version selection checks passed');
