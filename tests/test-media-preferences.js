'use strict';

var assert = require('assert');
var MediaPreferences = require('../shell/media-preferences');

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

var resolved = MediaPreferences.resolve(playback, { audioLanguage: 'ja', subtitleLanguage: 'it', subtitlesOff: false }, {
  audioLanguages: ['en'], subtitleLanguages: ['en'], subtitleMode: 'always', subtitleSuppressedForAudio: []
});
assert.strictEqual(resolved.audioStreamID, 'a2', 'an exact local audio language must win');
assert.strictEqual(resolved.subtitleStreamID, 's2', 'an exact local subtitle language must win');
assert.strictEqual(resolved.audioLabel, 'Japanese', 'resolved audio must expose a display label');
assert.strictEqual(resolved.fallbackUsed, false, 'available overrides must not report fallback');

resolved = MediaPreferences.resolve(playback, { audioLanguage: 'de', subtitleLanguage: 'fr', subtitlesOff: false }, {
  audioLanguages: ['en'], subtitleLanguages: ['it'], subtitleMode: 'always', subtitleSuppressedForAudio: []
});
assert.strictEqual(resolved.audioStreamID, 'a1', 'missing audio overrides must fall back to global priority');
assert.strictEqual(resolved.subtitleStreamID, 's2', 'missing subtitle overrides must fall back to global priority');
assert.strictEqual(resolved.fallbackUsed, true, 'missing override tracks must report fallback');

resolved = MediaPreferences.resolve(playback, { audioLanguage: 'ja', subtitleLanguage: 'it', subtitlesOff: true }, {
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
MediaPreferences.save(storage, identity, { audioLanguage: ' JA ', subtitleLanguage: 'it-IT', subtitlesOff: false, mediaIndex: 2, partIndex: 1 });
assert.deepStrictEqual(MediaPreferences.load(storage, identity), { audioLanguage: 'ja', subtitleLanguage: 'it', subtitlesOff: false, mediaIndex: 2, partIndex: 1 }, 'saved overrides and Plex version indexes must normalize and round-trip');
assert.deepStrictEqual(MediaPreferences.resolve(playback, { mediaIndex: 2, partIndex: 1 }, {}).mediaIndex, 2, 'the selected media version must reach playback options');
MediaPreferences.clear(storage, identity);
assert.strictEqual(MediaPreferences.load(storage, identity), null, 'clearing an override must restore Automatic');
stored[MediaPreferences.storageKey(identity)] = '{broken';
assert.strictEqual(MediaPreferences.load(storage, identity), null, 'corrupt storage must safely return no override');

console.log('Media preference checks passed');
