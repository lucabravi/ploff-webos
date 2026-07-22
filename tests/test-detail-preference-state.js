'use strict';

var assert = require('assert');
var DetailPreferenceState = require('../app/detail-preference-state');
var MediaPreferences = require('../app/media-preferences');
var MediaProfile = require('../app/media-profile');
var values = {};
var storage = {
  getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
  setItem: function (key, value) { values[key] = String(value); },
  removeItem: function (key) { delete values[key]; }
};
var state = DetailPreferenceState.create({ MediaPreferences: MediaPreferences, MediaProfile: MediaProfile, storage: storage });
var first = {
  mediaIndex: 0,
  partIndex: 0,
  audioTracks: [{ id: 'audio-en', languageTag: 'en' }, { id: 'audio-ja', languageTag: 'ja' }],
  subtitleTracks: [{ id: 'sub-it', languageTag: 'it' }]
};
var second = { mediaIndex: 1, partIndex: 0, audioTracks: [], subtitleTracks: [] };

state.prepare('server:profile:show:42');
state.setProfile({ versions: [first, second] });
assert.strictEqual(state.selectedProfile(), first, 'the first media version must be selected without an override');
assert.deepStrictEqual(state.choiceState(), { audio: true, subtitles: true, versions: true }, 'choice availability must come from the selected media profile');

state.cycleTrack('audio', 1);
assert.strictEqual(state.snapshot().override.audioTrack.language, 'en', 'cycling audio must persist a media-scoped track signature');
state.setTrack('audio', first.audioTracks[1], false);
assert.strictEqual(state.snapshot().override.audioTrack.language, 'ja', 'the shared choice dialog must be able to select an exact track');
state.cycleTrack('subtitle', 1);
assert.strictEqual(state.snapshot().override.subtitlesOff, true, 'cycling subtitles must include the off state');
state.cycleVersion(1);
assert.strictEqual(state.selectedProfile(), first, 'the automatic version entry must be the first version-cycle step');
state.cycleVersion(1);
assert.strictEqual(state.selectedProfile(), second, 'version cycling must select the requested media and part');
state.setVersion(0, 0);
assert.strictEqual(state.selectedProfile(), first, 'the shared choice dialog must be able to select a version directly');

assert.deepStrictEqual(
  state.playbackPreferences({ audioLanguages: ['it', 'en'], subtitleLanguages: ['it'] }, 'original').audioTrackPreference.language,
  'ja',
  'media audio track signatures must reach playback loading'
);
state.clear();
assert.deepStrictEqual(state.snapshot(), { profile: null, override: null, identity: '' }, 'leaving detail must clear all media-scoped state');

console.log('Detail preference state checks passed');
