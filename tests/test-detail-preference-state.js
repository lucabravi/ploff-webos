'use strict';

var assert = require('assert');
var DetailPreferenceState = require('../app/detail-preference-state');
var MediaPreferences = require('../app/media-preferences');
var MediaProfile = require('../app/media-profile');
var VersionSelection = require('../app/version-selection');

var values = {};
var storage = {
  getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
  setItem: function (key, value) { values[key] = String(value); },
  removeItem: function (key) { delete values[key]; }
};
var detail = { type: 'episode', ratingKey: 'episode-1', parentRatingKey: 'season-1', showRatingKey: 'show-1' };
var nextEpisode = { type: 'episode', ratingKey: 'episode-2', parentRatingKey: 'season-1', showRatingKey: 'show-1' };
var otherSeason = { type: 'episode', ratingKey: 'episode-3', parentRatingKey: 'season-2', showRatingKey: 'show-1' };
var first = {
  mediaIndex: 0, partIndex: 0, videoCodec: 'H264', container: 'MP4', width: 1920, height: 1080, bitrate: 5000,
  audioTracks: [{ id: 'audio-en', languageTag: 'en' }, { id: 'audio-ja', languageTag: 'ja' }],
  subtitleTracks: [{ id: 'sub-it', languageTag: 'it' }]
};
var second = {
  mediaIndex: 1, partIndex: 0, videoCodec: 'H264', container: 'MP4', width: 1280, height: 720, bitrate: 2500,
  audioTracks: [{ id: 'audio-en', languageTag: 'en' }], subtitleTracks: []
};
var firstSignature = VersionSelection.signature(first);
var state = DetailPreferenceState.create({
  MediaPreferences: MediaPreferences, MediaProfile: MediaProfile, VersionSelection: VersionSelection, storage: storage
});

state.prepare(MediaPreferences.identity('server', 'profile'), detail);
state.setProfile({ versions: [first, second] });
assert.strictEqual(state.selectedProfile(), first, 'Automatic must use the first available profile without an explicit choice');
assert.deepStrictEqual(state.choiceState(), { audio: true, subtitles: true, versions: true }, 'choice availability must come from the selected media profile');

state.cycleTrack('audio', 1);
assert.strictEqual(state.snapshot().override.audioTrack.language, 'en', 'cycling audio must persist a season-scoped track signature');
state.setTrack('audio', first.audioTracks[1], false);
assert.strictEqual(state.snapshot().override.audioTrack.language, 'ja', 'the shared choice dialog must be able to select an exact track');
state.cycleTrack('subtitle', 1);
assert.strictEqual(state.snapshot().override.subtitlesOff, true, 'cycling subtitles must include the Off state');

state.cycleVersion(1);
assert.strictEqual(state.selectedProfile(), first, 'the first explicit version must be selected after Automatic');
state.cycleVersion(1);
assert.strictEqual(state.selectedProfile(), second, 'version cycling must select the requested semantic version');
state.setVersion(0, 0);
assert.deepStrictEqual(state.snapshot().override.versionSignature, firstSignature, 'version choices must persist a semantic signature');
assert.strictEqual(Object.prototype.hasOwnProperty.call(state.snapshot().override, 'mediaIndex'), false, 'version state must not expose a physical media index');

var preferences = state.playbackPreferences({ audioLanguages: ['it', 'en'], subtitleLanguages: ['it'] }, 'original');
assert.strictEqual(preferences.audioTrackPreference.language, 'ja', 'media audio track signatures must reach playback loading');
assert.deepStrictEqual(preferences.versionAffinity, firstSignature, 'the shared playback resolver must receive the semantic version preference');

var nextPreferences = state.playbackPreferencesFor(nextEpisode, {}, 'original');
assert.deepStrictEqual(nextPreferences.versionAffinity, firstSignature, 'the next episode must resolve the preference from its own season');
assert.strictEqual(nextPreferences.audioTrackPreference.language, 'ja', 'the next episode must resolve the season audio preference');
assert.strictEqual(Object.prototype.hasOwnProperty.call(state.playbackPreferencesFor(otherSeason, {}, 'original'), 'versionAffinity'), false, 'a different season must not inherit the previous season choice');

state.setTrack('subtitles', null, false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(state.snapshot().override, 'subtitlesOff'), false, 'Automatic subtitles must remove only the subtitle choice');
assert.ok(state.snapshot().override.audioTrack, 'removing the subtitle choice must preserve audio');
state.setVersion(null, null);
assert.strictEqual(Object.prototype.hasOwnProperty.call(state.snapshot().override, 'versionSignature'), false, 'Automatic version must remove only the version choice');
assert.ok(state.snapshot().override.audioTrack, 'removing the version choice must preserve audio');

state.prepare(MediaPreferences.identity('server', 'profile'), { type: 'movie', ratingKey: 'movie-1' });
state.setProfile({ versions: [first] });
state.setTrack('audio', first.audioTracks[1], false);
assert.strictEqual(MediaPreferences.scopeForDetail({ type: 'movie', ratingKey: 'movie-1' }), 'media', 'movie preferences must use media scope');

state.clear();
assert.deepStrictEqual(state.snapshot(), { profile: null, override: null, identity: '' }, 'leaving detail must clear all preference state');

console.log('Detail preference state checks passed');

(function migratesVersionOnlyAfterItsProfileIsAvailable() {
  var id = MediaPreferences.identity('migration-server', 'migration-profile');
  var legacyKey = MediaPreferences.LEGACY_STORAGE_PREFIX + encodeURIComponent('migration-server:migration-profile:show:show-1');
  values[legacyKey] = JSON.stringify({ mediaIndex: 1, partIndex: 0 });
  state.prepare(id, detail);
  state.setProfile({ versions: [first] });
  assert.ok(state.snapshot().override.legacyVersion, 'missing legacy version must remain pending rather than persist a fallback');
  state.setProfile({ versions: [first, second] });
  assert.strictEqual(state.selectedProfile(), second, 'legacy file choice must be converted using the loaded profile');
  assert.deepStrictEqual(state.snapshot().override.versionSignature, VersionSelection.signature(second));
  assert.strictEqual(state.snapshot().override.legacyVersion, undefined);
  state.prepare(id, nextEpisode);
  var reordered = Object.assign({}, second, { mediaIndex: 0 });
  state.setProfile({ versions: [Object.assign({}, first, { mediaIndex: 1 }), reordered] });
  assert.strictEqual(state.selectedProfile(), reordered, 'later episodes must use the migrated signature despite changed indices');
}());


(function versionCycleUsesResolvedSemanticPreferenceAcrossEpisodes() {
  var semanticIdentity = MediaPreferences.identity('semantic-server', 'semantic-profile');
  var preferred = {
    mediaIndex: 0, partIndex: 0, videoCodec: 'HEVC', container: 'MKV', width: 3840, height: 2160, bitrate: 20000,
    videoResolution: '4k', hdr: true, audioTracks: [], subtitleTracks: []
  };
  var alternate = {
    mediaIndex: 1, partIndex: 0, videoCodec: 'H264', container: 'MP4', width: 1920, height: 1080, bitrate: 5000,
    videoResolution: '1080', hdr: false, audioTracks: [], subtitleTracks: []
  };
  var resolved = {
    mediaIndex: 0, partIndex: 0, videoCodec: 'HEVC', container: 'MKV', width: 3840, height: 2160, bitrate: 14500,
    videoResolution: '4k', hdr: true, audioTracks: [], subtitleTracks: []
  };
  state.prepare(semanticIdentity, detail);
  state.setProfile({ versions: [preferred, alternate] });
  state.setVersion(preferred);
  state.prepare(semanticIdentity, nextEpisode);
  state.setProfile({ versions: [alternate, resolved] });
  assert.strictEqual(state.selectedProfile(), resolved, 'semantic preference must resolve despite episode bitrate changes');
  state.cycleVersion(1);
  assert.strictEqual(!!(state.snapshot().override && Object.prototype.hasOwnProperty.call(state.snapshot().override, 'versionSignature')), false, 'cycling forward from the resolved explicit version must reach Automatic');
}());

(function detailAndPlaybackShareSubtitleFallback() {
  var track = { id: 'en', languageTag: 'en', format: 'srt', external: true, selected: true };
  var playback = { options: {}, audioTracks: [{ id: 'a', languageTag: 'en' }], subtitleTracks: [track] };
  state.prepare('fallback-server|profile', detail);
  state.setProfile(playback);
  state.setTrack('subtitles', { languageTag: 'ja', format: 'ass', external: true }, false);
  [
    { subtitleMode: 'off' },
    { subtitleMode: 'always', subtitleSuppressedForAudio: ['en'] },
    { subtitleMode: 'audio-mismatch', subtitleLanguages: ['en'] },
    { subtitleMode: 'always', subtitleLanguages: ['en'] }
  ].forEach(function (settings) {
    var detailTrack = state.resolved(settings).subtitleStreamID;
    assert.strictEqual(MediaPreferences.resolvePlaybackOptions(playback, state.playbackPreferences(settings, 'original')).subtitleStreamID, detailTrack,
      'missing preferred subtitle must use the same global fallback in Detail and playback');
    assert.strictEqual(state.snapshot().override.subtitleTrack.language, 'ja', 'fallback must not rewrite the selection');
  });
  state.setTrack('subtitles', track, false);
  assert.strictEqual(MediaPreferences.resolvePlaybackOptions(playback, state.playbackPreferences({ subtitleMode: 'off' }, 'original')).subtitleStreamID, 'en',
    'an available explicit choice must override the global Off default');
  state.setTrack('subtitles', null, true);
  assert.strictEqual(MediaPreferences.resolvePlaybackOptions(playback, state.playbackPreferences({ subtitleMode: 'always' }, 'original')).subtitleStreamID, '',
    'explicit Off must override global Always');
}());
