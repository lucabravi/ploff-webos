'use strict';

var assert = require('assert');
var MediaPreferences = require('../app/media-preferences');

var episodeOne = { type: 'episode', ratingKey: '101', showRatingKey: '10' };
var episodeTwo = { type: 'episode', ratingKey: '102', showRatingKey: '10' };
var movieOne = { type: 'movie', ratingKey: '201' };
var movieTwo = { type: 'movie', ratingKey: '202' };

assert.strictEqual(MediaPreferences.key('server-a', 'profile-a', episodeOne), MediaPreferences.key('server-a', 'profile-a', episodeTwo), 'episodes in one show must share an override');
assert.notStrictEqual(MediaPreferences.key('server-a', 'profile-a', movieOne), MediaPreferences.key('server-a', 'profile-a', movieTwo), 'movies must retain independent overrides');
assert.notStrictEqual(MediaPreferences.key('server-a', 'profile-a', movieOne), MediaPreferences.key('server-b', 'profile-a', movieOne), 'overrides must remain server-specific');

var playback = {
  options: { subtitleSize: 120, offset: 42, videoQuality: 'original', playbackMode: 'auto' },
  audioTracks: [
    { id: 'a1', language: 'English', languageTag: 'en', selected: true },
    { id: 'a2', language: 'Japanese', languageCode: 'jpn' }
  ],
  subtitleTracks: [
    { id: 's1', language: 'English', languageTag: 'en', selected: true },
    { id: 's2', language: 'Italiano', languageCode: 'ita' }
  ]
};

var duplicateTracks = {
  options: {},
  audioTracks: [
    { id: 'a-dynamic', language: 'Italiano', languageTag: 'it', title: 'Italiano Dynamic 2.0', codec: 'ac3', channels: 2, external: false },
    { id: 'a-mediaset', language: 'Italiano', languageTag: 'it', title: 'Italiano Mediaset 5.1', codec: 'ac3', channels: 6, external: false }
  ],
  subtitleTracks: [
    { id: 's-mediaset', language: 'Italiano', languageTag: 'it', title: 'Italiano - Mediaset', codec: 'ass', external: false },
    { id: 's-external', language: 'Italiano', languageTag: 'it', codec: 'ass', external: true }
  ]
};
var mediasetPreference = MediaPreferences.trackPreference(duplicateTracks.audioTracks[1]);
assert.deepStrictEqual(mediasetPreference, { language: 'it', name: 'italiano mediaset 5.1', codec: 'ac3', channels: 6, external: false }, 'track preferences must persist the progressive identity fields');
assert.strictEqual(MediaPreferences.findTrack(duplicateTracks.audioTracks, mediasetPreference, false).id, 'a-mediaset', 'a progressive signature must distinguish tracks in the same language');
assert.strictEqual(MediaPreferences.findTrack([
  { id: 'fallback-2', languageTag: 'it', codec: 'ac3', channels: 2 },
  { id: 'fallback-6', languageTag: 'it', codec: 'ac3', channels: 6 }
], mediasetPreference, false).id, 'fallback-6', 'missing titles on another episode must fall through to codec and channels');
assert.strictEqual(MediaPreferences.resolve(duplicateTracks, null, {
  audioLanguages: ['it'], subtitleLanguages: ['it'], subtitleMode: 'always', subtitleSourcePreference: 'external'
}).subtitleStreamID, 's-external', 'automatic subtitle selection must prefer external tracks by default');
assert.strictEqual(MediaPreferences.resolve(duplicateTracks, null, {
  audioLanguages: ['it'], subtitleLanguages: ['it'], subtitleMode: 'always', subtitleSourcePreference: 'internal'
}).subtitleStreamID, 's-mediaset', 'automatic subtitle selection must honor the global internal preference');

var resolved = MediaPreferences.resolve(playback, { audioTrack: MediaPreferences.trackPreference(playback.audioTracks[1]), subtitleTrack: MediaPreferences.trackPreference(playback.subtitleTracks[1]), subtitlesOff: false }, {
  audioLanguages: ['en'], subtitleLanguages: ['en'], subtitleMode: 'always', subtitleSuppressedForAudio: []
});
assert.strictEqual(resolved.audioStreamID, 'a2', 'an exact local audio language must win');
assert.strictEqual(resolved.subtitleStreamID, 's2', 'an exact local subtitle language must win');
assert.strictEqual(resolved.audioLabel, 'Japanese', 'resolved audio must expose a display label');
assert.strictEqual(resolved.audioTrack, playback.audioTracks[1], 'resolved audio must expose the selected track metadata');
assert.strictEqual(resolved.subtitleTrack, playback.subtitleTracks[1], 'resolved subtitles must expose the selected track metadata');
assert.strictEqual(resolved.fallbackUsed, false, 'available overrides must not report fallback');

resolved = MediaPreferences.resolve(playback, { audioTrack: { language: 'de' }, subtitleTrack: { language: 'fr' }, subtitlesOff: false }, {
  audioLanguages: ['en'], subtitleLanguages: ['it'], subtitleMode: 'always', subtitleSuppressedForAudio: []
});
assert.strictEqual(resolved.audioStreamID, 'a1', 'missing audio overrides must fall back to global priority');
assert.strictEqual(resolved.subtitleStreamID, 's2', 'missing subtitle overrides must fall back to global priority');
assert.strictEqual(resolved.fallbackUsed, true, 'missing override tracks must report fallback');

resolved = MediaPreferences.resolve(playback, { audioTrack: MediaPreferences.trackPreference(playback.audioTracks[1]), subtitleTrack: MediaPreferences.trackPreference(playback.subtitleTracks[1]), subtitlesOff: true }, {
  audioLanguages: ['en'], subtitleLanguages: ['it'], subtitleMode: 'always', subtitleSuppressedForAudio: []
});
assert.strictEqual(resolved.subtitleStreamID, '', 'explicit subtitle Off must disable subtitles');

var stored = {};
var storage = {
  getItem: function (key) { return stored[key] || null; },
  setItem: function (key, value) { stored[key] = value; },
  removeItem: function (key) { delete stored[key]; }
};
var identity = MediaPreferences.key('server-a', 'profile-a', episodeOne);
MediaPreferences.save(storage, identity, { audioTrack: mediasetPreference, subtitleTrack: null, subtitlesOff: false, mediaIndex: 2, partIndex: 1 });
assert.deepStrictEqual(MediaPreferences.load(storage, identity), { audioTrack: mediasetPreference, subtitleTrack: null, subtitlesOff: false, mediaIndex: 2, partIndex: 1 }, 'track signatures and Plex version indexes must normalize and round-trip');
MediaPreferences.save(storage, identity, { audioTrack: mediasetPreference, subtitleTrack: MediaPreferences.trackPreference(duplicateTracks.subtitleTracks[1]), subtitlesOff: false });
assert.deepStrictEqual(MediaPreferences.load(storage, identity).audioTrack, mediasetPreference, 'progressive track signatures must round-trip through local storage');
assert.deepStrictEqual(MediaPreferences.resolve(playback, { mediaIndex: 2, partIndex: 1 }, {}).mediaIndex, 2, 'the selected media version must reach playback options');
MediaPreferences.clear(storage, identity);
assert.strictEqual(MediaPreferences.load(storage, identity), null, 'clearing an override must restore Automatic');
stored[MediaPreferences.storageKey(identity)] = '{broken';
assert.strictEqual(MediaPreferences.load(storage, identity), null, 'corrupt storage must safely return no override');

console.log('Media preference checks passed');
