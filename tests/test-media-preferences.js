'use strict';

var assert = require('assert');
var MediaPreferences = require('../app/media-preferences');

var episodeOne = { type: 'episode', ratingKey: '101', parentRatingKey: 'season-a', showRatingKey: '10' };
var episodeTwo = { type: 'episode', ratingKey: '102', parentRatingKey: 'season-a', showRatingKey: '10' };
var otherSeasonEpisode = { type: 'episode', ratingKey: '103', parentRatingKey: 'season-b', showRatingKey: '10' };
var movieOne = { type: 'movie', ratingKey: '201' };
var movieTwo = { type: 'movie', ratingKey: '202' };
var identity = MediaPreferences.identity('server-a', 'profile-a');

assert.strictEqual(MediaPreferences.scopeForDetail(episodeOne), 'season', 'series selections must be stored at season scope');
assert.strictEqual(MediaPreferences.scopeForDetail(movieOne), 'media', 'movie selections must be stored at media scope');
assert.strictEqual(MediaPreferences.scopeKey(identity, 'season', episodeOne.parentRatingKey), MediaPreferences.scopeKey(identity, 'season', episodeTwo.parentRatingKey), 'episodes in one season must share a selection record');
assert.notStrictEqual(MediaPreferences.scopeKey(identity, 'season', episodeOne.parentRatingKey), MediaPreferences.scopeKey(identity, 'season', otherSeasonEpisode.parentRatingKey), 'different seasons must retain independent selection records');
assert.notStrictEqual(identity, MediaPreferences.identity('server-a', 'profile-b'), 'selection records must be profile-specific');
assert.notStrictEqual(identity, MediaPreferences.identity('server-b', 'profile-a'), 'selection records must be server-specific');

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
  audioLanguages: ['en'], subtitleLanguages: ['en'], subtitleMode: 'always', subtitleSuppressedForAudio: [], subtitleSize: 150
});
assert.strictEqual(resolved.audioStreamID, 'a2', 'an exact local audio language must win');
assert.strictEqual(resolved.subtitleStreamID, 's2', 'an exact local subtitle language must win');
assert.strictEqual(resolved.audioLabel, 'Japanese', 'resolved audio must expose a display label');
assert.strictEqual(resolved.audioTrack, playback.audioTracks[1], 'resolved audio must expose the selected track metadata');
assert.strictEqual(resolved.subtitleTrack, playback.subtitleTracks[1], 'resolved subtitles must expose the selected track metadata');
assert.strictEqual(resolved.subtitleSize, 150, 'playback must use the same subtitle size as the global preference');
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
  getItem: function (key) { return Object.prototype.hasOwnProperty.call(stored, key) ? stored[key] : null; },
  setItem: function (key, value) { stored[key] = String(value); },
  removeItem: function (key) { delete stored[key]; }
};
var version = { videoCodec: 'h264', container: 'mp4', width: 1920, height: 1080, bitrate: 5000, hdr: 0 };
var seasonScopes = MediaPreferences.updateSelection(storage, identity, episodeOne, {
  audioTrack: mediasetPreference,
  subtitleTrack: MediaPreferences.trackPreference(duplicateTracks.subtitleTracks[1]),
  versionSignature: version
});
assert.strictEqual(MediaPreferences.selectionSource(seasonScopes, episodeTwo, 'audioTrack'), 'season', 'explicit episode choices must report season provenance');
assert.deepStrictEqual(MediaPreferences.effectiveSelection(MediaPreferences.loadScopes(storage, identity, episodeTwo), episodeTwo).versionSignature, version, 'semantic version selection must resolve on another episode in the same season');
assert.strictEqual(Object.prototype.hasOwnProperty.call(JSON.parse(stored[MediaPreferences.scopeKey(identity, 'season', 'season-a')]), 'mediaIndex'), false, 'new version selections must never persist physical media indexes');

seasonScopes = MediaPreferences.updateSelection(storage, identity, episodeTwo, { subtitleTrack: null, subtitlesOff: false });
assert.strictEqual(Object.prototype.hasOwnProperty.call(MediaPreferences.effectiveSelection(seasonScopes, episodeTwo), 'subtitleTrack'), false, 'Automatic subtitles must remove only the subtitle override');
assert.ok(MediaPreferences.effectiveSelection(seasonScopes, episodeTwo).audioTrack, 'Automatic subtitles must preserve other season choices');
MediaPreferences.updateSelection(storage, identity, episodeTwo, { versionSignature: null });
assert.ok(MediaPreferences.effectiveSelection(MediaPreferences.loadScopes(storage, identity, episodeTwo), episodeTwo).audioTrack, 'Automatic version must preserve unrelated choices');

MediaPreferences.updateSelection(storage, identity, movieOne, { audioTrack: mediasetPreference });
assert.ok(MediaPreferences.effectiveSelection(MediaPreferences.loadScopes(storage, identity, movieOne), movieOne).audioTrack, 'movie preferences must be media-scoped');
assert.strictEqual(MediaPreferences.effectiveSelection(MediaPreferences.loadScopes(storage, identity, movieTwo), movieTwo), null, 'movie preferences must not leak to another movie');
assert.strictEqual(MediaPreferences.effectiveSelection(MediaPreferences.loadScopes(storage, MediaPreferences.identity('server-a', 'profile-b'), episodeOne), episodeOne), null, 'preferences must not leak between Plex Home profiles');

var legacyDetail = { type: 'episode', ratingKey: 'legacy-episode', showRatingKey: 'legacy-show', parentRatingKey: 'legacy-season' };
var legacyIdentity = MediaPreferences.identity('server-legacy', 'profile-legacy');
var legacyKey = MediaPreferences.LEGACY_STORAGE_PREFIX + encodeURIComponent('server-legacy:profile-legacy:show:legacy-show');
stored[legacyKey] = JSON.stringify({ audioTrack: { language: 'ja' }, mediaIndex: 4, partIndex: 1 });
var migrated = MediaPreferences.loadScopes(storage, legacyIdentity, legacyDetail);
assert.strictEqual(migrated.migrated, true, 'legacy media preferences must migrate when first opened');
assert.strictEqual(migrated.season.audioTrack.language, 'ja', 'legacy audio preference must be retained during migration');
assert.deepStrictEqual(migrated.season.legacyVersion, { mediaIndex: 4, partIndex: 1 }, 'legacy physical version data may be retained for compatibility but is not a semantic selection');
MediaPreferences.updateSelection(storage, legacyIdentity, legacyDetail, { audioTrack: null, legacyVersion: null });
assert.strictEqual(MediaPreferences.effectiveSelection(MediaPreferences.loadScopes(storage, legacyIdentity, legacyDetail), legacyDetail), null,
  'clearing the last migrated override must not import the v1 record again');
assert.strictEqual(stored[MediaPreferences.scopeKey(legacyIdentity, 'season', 'legacy-season')], '{}',
  'an empty scoped record must distinguish Automatic from a never-migrated scope');
assert.strictEqual(MediaPreferences.loadScopes(storage, legacyIdentity, {
  type: 'episode', ratingKey: 'legacy-other', parentRatingKey: 'legacy-other-season', showRatingKey: 'legacy-show'
}).season.audioTrack.language, 'ja', 'resetting one season must not discard legacy preferences for other seasons');
assert.strictEqual(MediaPreferences.effectiveSelection(MediaPreferences.loadScopes(storage, MediaPreferences.identity('server-legacy', 'other-profile'), legacyDetail), legacyDetail), null, 'migrated preferences must remain isolated from another profile');

MediaPreferences.save(storage, identity, { audioTrack: mediasetPreference, mediaIndex: 2, partIndex: 1 });
assert.deepStrictEqual(MediaPreferences.load(storage, identity), { audioTrack: mediasetPreference, legacyVersion: { mediaIndex: 2, partIndex: 1 } }, 'direct compatibility storage must normalize legacy indexes without using them as the new version identity');
MediaPreferences.clear(storage, identity);
assert.strictEqual(MediaPreferences.load(storage, identity), null, 'clearing a direct compatibility record must restore Automatic');
stored[MediaPreferences.storageKey(identity)] = '{broken';
assert.strictEqual(MediaPreferences.load(storage, identity), null, 'corrupt storage must safely return no override');
assert.doesNotThrow(function () {
  var unavailable = { setItem: function () { throw new Error('quota'); }, removeItem: function () { throw new Error('blocked'); } };
  MediaPreferences.save(unavailable, identity, { audioTrack: mediasetPreference });
  MediaPreferences.clear(unavailable, identity);
}, 'track changes must remain usable when persistence is unavailable');

assert.doesNotThrow(function () {
  var unreadable = {
    getItem: function () { throw new Error('storage unavailable'); },
    setItem: function () { throw new Error('storage unavailable'); },
    removeItem: function () { throw new Error('storage unavailable'); }
  };
  var scopes = MediaPreferences.loadScopes(unreadable, identity, episodeOne);
  assert.strictEqual(scopes.season, null);
  assert.strictEqual(scopes.media, null);
}, 'scoped preference reads must degrade safely when local storage is unavailable');

(function detailedScopedSubtitleSignatureCanResolveDuplicateEmbeddedTrack() {
  var tracks = [
    { id: 'embedded-4', index: 4, languageTag: 'it', codec: 'ass', format: 'ass', external: false, title: 'Dialoghi', forced: false },
    { id: 'embedded-5', index: 5, languageTag: 'it', codec: 'ass', format: 'ass', external: false, title: 'Dialoghi', forced: false }
  ];
  assert.strictEqual(MediaPreferences.findTrack(tracks, {
    language: 'it', format: 'ass', codec: 'ass', external: false, name: 'dialoghi', forced: false, index: 5
  }, false).id, 'embedded-5', 'detailed scoped subtitle signatures must preserve forced/index identity when available');
}());

console.log('Media preference checks passed');

(function explicitTrackIdentityDoesNotCrossSourceOrForcedState() {
  var sourcePlayback = {
    options: {},
    audioTracks: [{ id: 'audio-it', languageTag: 'it' }],
    subtitleTracks: [
      { id: 'internal-it', languageTag: 'it', codec: 'srt', external: false, forced: false, title: 'Dialoghi' },
      { id: 'forced-it', languageTag: 'it', codec: 'srt', external: true, forced: true, title: 'Dialoghi' }
    ]
  };
  var requestedExternal = { language: 'it', name: 'dialoghi', codec: 'srt', channels: 0, external: true, forced: false };
  var requestedRegular = { language: 'it', name: 'dialoghi', codec: 'srt', channels: 0, external: true, forced: false };
  assert.strictEqual(MediaPreferences.findTrack([sourcePlayback.subtitleTracks[0]], requestedExternal, false), null,
    'an unavailable external preference must not silently resolve to an internal subtitle');
  assert.strictEqual(MediaPreferences.findTrack([sourcePlayback.subtitleTracks[1]], requestedRegular, false), null,
    'an unavailable regular preference must not silently resolve to a forced subtitle');
  assert.strictEqual(MediaPreferences.resolve({ options: {}, audioTracks: sourcePlayback.audioTracks, subtitleTracks: [sourcePlayback.subtitleTracks[0]] }, {
    subtitleTrack: requestedExternal
  }, { subtitleMode: 'off', subtitleLanguages: ['it'], subtitleSuppressedForAudio: [] }).subtitleStreamID, '',
  'when the explicit source is absent, playback must return to the global subtitle fallback policy');
}());

(function corruptScopedRecordDoesNotBlockLegacyMigration() {
  var corruptValues = {};
  var corruptStorage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(corruptValues, key) ? corruptValues[key] : null; },
    setItem: function (key, value) { corruptValues[key] = String(value); },
    removeItem: function (key) { delete corruptValues[key]; }
  };
  var detail = { type: 'episode', ratingKey: 'corrupt-episode', parentRatingKey: 'corrupt-season', showRatingKey: 'corrupt-show' };
  var id = MediaPreferences.identity('corrupt-server', 'corrupt-profile');
  corruptValues[MediaPreferences.scopeKey(id, 'season', detail.parentRatingKey)] = '{broken';
  corruptValues[MediaPreferences.LEGACY_STORAGE_PREFIX + encodeURIComponent('corrupt-server:corrupt-profile:show:corrupt-show')] = JSON.stringify({ audioTrack: { language: 'ja' } });
  var scopes = MediaPreferences.loadScopes(corruptStorage, id, detail);
  assert.strictEqual(scopes.migrated, true, 'a malformed v2 scope must not masquerade as an intentional Automatic reset marker');
  assert.strictEqual(scopes.season.audioTrack.language, 'ja', 'valid legacy preferences must remain recoverable when the newer scope is corrupt');
}());


(function emptyTrackPreferenceFallsBackToGlobalPolicy() {
  var playback = {
    options: {},
    audioTracks: [
      { id: 'audio-en', languageTag: 'en', codec: 'aac', external: false },
      { id: 'audio-ja', languageTag: 'ja', codec: 'aac', external: false }
    ],
    subtitleTracks: []
  };
  var resolved = MediaPreferences.resolve(playback, { audioTrack: {} }, { audioLanguages: ['ja'] });
  assert.strictEqual(resolved.audioStreamID, 'audio-ja',
    'an empty or corrupt explicit audio signature must be ignored so the global language policy can resolve the track');
}());

(function emptyVersionSignatureIsNotAnExplicitOverride() {
  assert.strictEqual(MediaPreferences.versionSignature({}), null,
    'an empty version signature must normalize to Automatic instead of becoming a meaningless explicit override');
  assert.deepStrictEqual(MediaPreferences.normalize({ versionSignature: {} }), {},
    'a corrupt empty version signature must be discarded while loading stored preferences');
}());


(function unknownScopedFieldsDoNotBlockLegacyMigration() {
  var values = {};
  var memory = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem: function (key, value) { values[key] = String(value); },
    removeItem: function (key) { delete values[key]; }
  };
  var detail = { type: 'episode', ratingKey: 'unknown-episode', parentRatingKey: 'unknown-season', showRatingKey: 'unknown-show' };
  var id = MediaPreferences.identity('unknown-server', 'unknown-profile');
  values[MediaPreferences.scopeKey(id, 'season', detail.parentRatingKey)] = JSON.stringify({ staleField: 'unsupported' });
  values[MediaPreferences.LEGACY_STORAGE_PREFIX + encodeURIComponent('unknown-server:unknown-profile:show:unknown-show')] = JSON.stringify({ audioTrack: { language: 'ja' } });
  var scopes = MediaPreferences.loadScopes(memory, id, detail);
  assert.strictEqual(scopes.migrated, true,
    'a non-empty v2 object with no recognized preference fields must be treated as corrupt rather than as an Automatic marker');
  assert.strictEqual(scopes.season.audioTrack.language, 'ja',
    'legacy preferences must remain recoverable when the v2 object only contains unknown fields');
}());

(function embeddedSubtitleIndexDoesNotFallThroughToDifferentDuplicate() {
  var tracks = [
    { id: 'embedded-4', index: 4, languageTag: 'it', codec: 'ass', format: 'ass', external: false, forced: false, title: 'Dialoghi' }
  ];
  var preference = { language: 'it', name: 'dialoghi', codec: 'ass', channels: 0, external: false, forced: false, index: 5 };
  assert.strictEqual(MediaPreferences.findTrack(tracks, preference, false), null,
    'an explicit embedded subtitle index must not silently fall through to a different duplicate stream when the requested index is absent');
}());
