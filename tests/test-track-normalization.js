'use strict';

var assert = require('assert');
var MediaProfile = require('../app/media-profile');
var PlexClient = require('../app/plex-client');
var source = {
  id: '12',
  index: '3',
  language: 'Italiano',
  languageTag: 'it-IT',
  languageCode: 'ita',
  codec: 'srt',
  key: '/library/streams/12',
  offset: '450',
  forced: '1',
  selected: '1',
  title: 'Forced signs',
  displayTitle: 'Italiano (SRT External)',
  extendedDisplayTitle: 'Italiano (SRT External)',
  channels: '2',
  audioChannelLayout: 'stereo',
  bitrate: '192',
  samplingRate: '48000',
  bitDepth: '24',
  profile: 'main'
};
var expected = {
  id: '12',
  language: 'Italiano',
  languageTag: 'it',
  languageCode: 'it',
  codec: 'srt',
  forced: true,
  selected: true,
  title: 'Forced signs',
  index: 3,
  key: '/library/streams/12',
  external: true,
  format: 'srt',
  offset: 450,
  displayTitle: 'Italiano (SRT External)',
  extendedDisplayTitle: 'Italiano (SRT External)',
  channels: 2,
  channelLayout: 'stereo',
  bitrate: 192,
  samplingRate: 48000,
  bitDepth: 24,
  profile: 'main'
};

assert.strictEqual(typeof MediaProfile.trackFromAttributes, 'function',
  'MediaProfile must expose the authoritative Plex track normalizer');
assert.deepStrictEqual(MediaProfile.trackFromAttributes(source), expected,
  'the authoritative track record must preserve playback-facing semantics');
assert.deepStrictEqual(PlexClient.trackFromAttributes(source), expected,
  'PlexClient must delegate track normalization without changing its public record');

console.log('Track normalization checks passed');
