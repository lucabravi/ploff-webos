'use strict';

var assert = require('assert');
var MediaProfile = require('../shell/media-profile');

var fullHd = MediaProfile.fromNodes(
  { ratingKey: '42' },
  { id: '7', container: 'mkv', videoResolution: '1080', width: '1920', height: '1080', bitrate: '12000', videoCodec: 'h264', audioCodec: 'aac', audioChannels: '2' },
  { id: '99', size: String(2576980377), container: 'mkv' },
  [
    { id: '10', streamType: '2', language: 'Japanese', languageTag: 'ja', codec: 'aac', channels: '2', selected: '1' },
    { id: '20', streamType: '3', index: '4', language: 'Italiano', languageTag: 'it', codec: 'srt', key: '/library/streams/20', offset: '-250' }
  ]
);
assert.strictEqual(fullHd.summary, '1080p · MKV · 2.4 GB', '1080p files must expose a compact summary');
assert.strictEqual(fullHd.partId, '99', 'the playable part identifier must be retained');
assert.strictEqual(fullHd.audioTracks.length, 1, 'audio tracks must be parsed');
assert.strictEqual(fullHd.subtitleTracks.length, 1, 'subtitle tracks must be parsed');
assert.deepStrictEqual(MediaProfile.subtitleLanguages(fullHd), ['Italiano'], 'media information must expose the available subtitle languages');
assert.deepStrictEqual(fullHd.subtitleTracks[0], {
  id: '20',
  language: 'Italiano',
  languageTag: 'it',
  languageCode: 'it',
  codec: 'SRT',
  channels: 0,
  forced: false,
  selected: false,
  title: '',
  index: 4,
  key: '/library/streams/20',
  external: true,
  format: 'srt',
  offset: -250
}, 'subtitle metadata must retain source, index and existing Plex offset');

var hdr = MediaProfile.fromNodes({}, {
  container: 'mkv', videoResolution: '4k', width: '3840', height: '2160', videoCodec: 'hevc', videoDynamicRange: 'HDR10', bitrate: '24000'
}, { id: '100' }, []);
assert.strictEqual(hdr.resolution, '4K', '4K resolution must be normalized for display');
assert.strictEqual(hdr.videoDynamicRange, 'HDR10', 'HDR metadata must be retained');
assert.strictEqual(hdr.summary, '4K · MKV', 'missing size must be omitted instead of showing a placeholder');

var sparse = MediaProfile.fromNodes({}, {}, { id: '101', size: '0' }, []);
assert.strictEqual(sparse.summary, '', 'missing technical values must produce an empty compact summary');
assert.deepStrictEqual(MediaProfile.subtitleLanguages({ subtitleTracks: [
  { language: 'Italiano', languageTag: 'it' },
  { language: 'Italiano (forced)', languageTag: 'it' },
  { language: 'English', languageTag: 'en' }
] }), ['Italiano', 'English'], 'subtitle language information must be deduplicated by language code');

assert.deepStrictEqual(MediaProfile.choiceState({ audioTracks: [{}], subtitleTracks: [{}] }, [{}]), {
  audio: false,
  subtitles: true,
  versions: false
}, 'a single audio or media version has no alternative, while one subtitle can still be toggled off');
assert.deepStrictEqual(MediaProfile.choiceState({ audioTracks: [{}, {}], subtitleTracks: [] }, [{}, {}]), {
  audio: true,
  subtitles: false,
  versions: true
}, 'selectors must expose arrows only when another choice exists');

var versions = MediaProfile.fromVersions({}, [
  { media: { container: 'mp4', videoResolution: '1080', height: '1080', videoCodec: 'h264' }, parts: [{ part: { id: 'a', size: '1000' }, streams: [] }] },
  { media: { container: 'mkv', videoResolution: '4k', height: '2160', videoCodec: 'hevc', videoDynamicRange: 'HDR10' }, parts: [{ part: { id: 'b', size: String(10737418240) }, streams: [] }] }
]);
assert.strictEqual(versions.length, 2, 'media information must expose every Plex version');
assert.strictEqual(versions[1].mediaIndex, 1, 'technical versions must retain the Plex media index');
assert.strictEqual(versions[1].summary, '4K · MKV · 10 GB', 'version labels must expose resolution, container and size');

console.log('Media profile checks passed');
