'use strict';

var assert = require('assert');
var SubtitleSeriesOffset = require('../app/subtitle-series-offset');

var reference = {
  id: 'current',
  languageTag: 'it',
  language: 'Italiano',
  codec: 'SRT',
  format: 'srt',
  external: true,
  title: 'Dialoghi',
  displayTitle: 'Italiano (SRT External)',
  forced: false
};

var candidates = [
  { id: 'wrong-language', languageTag: 'en', codec: 'SRT', format: 'srt', external: true, displayTitle: 'English (SRT External)' },
  { id: 'other-italian', languageTag: 'it', language: 'Italiano', codec: 'SRT', format: 'srt', external: true, title: 'Signs', displayTitle: 'Italiano (Signs)' },
  { id: 'matching-one', languageTag: 'it', language: 'Italiano', codec: 'SRT', format: 'srt', external: true, title: 'Dialoghi', displayTitle: 'Italiano (SRT External)', forced: false },
  { id: 'matching-duplicate', languageTag: 'it', language: 'Italiano', codec: 'SRT', format: 'srt', external: true, title: 'Dialoghi', displayTitle: 'Italiano (SRT External)', forced: false }
];

assert.deepStrictEqual(SubtitleSeriesOffset.matchTracks(reference, candidates).map(function (track) { return track.id; }), ['matching-one', 'matching-duplicate'],
  'matching subtitle occurrences must remain visible and receive the same series offset');
assert.deepStrictEqual(SubtitleSeriesOffset.matchTracks(reference, [
  { id: 'embedded', languageTag: 'it', codec: 'SRT', format: 'srt', external: false },
  { id: 'ass', languageTag: 'it', codec: 'ASS', format: 'ass', external: true }
]), [], 'embedded tracks and different subtitle formats must never be selected for presentation matching');
assert.deepStrictEqual(SubtitleSeriesOffset.matchTracks(reference, [
  { id: 'fallback', languageTag: 'it', language: 'Italiano', codec: 'SRT', format: 'srt', external: true }
]).map(function (track) { return track.id; }), ['fallback'], 'language and external text format are a safe fallback when descriptive metadata is absent');
assert.deepStrictEqual(SubtitleSeriesOffset.matchTracks(reference, [
  { id: 'ambiguous', languageTag: 'it', language: 'Italiano', codec: 'VTT', format: 'webvtt', external: true },
  { id: 'not-text', languageTag: 'it', codec: 'PGS', format: 'pgs', external: true }
]), [], 'a different text codec must not be treated as the same subtitle stream');

var assReference = {
  id: 'ass-current', languageTag: 'it', codec: 'ASS', format: 'ass', external: true,
  title: 'Dialoghi', forced: false
};
assert.deepStrictEqual(SubtitleSeriesOffset.matchTracks(assReference, [
  { id: 'ass-match', languageTag: 'it', codec: 'ASS', format: 'ass', external: true, title: 'Dialoghi', forced: false },
  { id: 'ass-other-title', languageTag: 'it', codec: 'ASS', format: 'ass', external: true, title: 'Signs', forced: false },
  { id: 'ass-embedded', languageTag: 'it', codec: 'ASS', format: 'ass', external: false, title: 'Dialoghi', forced: false },
  { id: 'pgs', languageTag: 'it', codec: 'PGS', format: 'pgs', external: true, title: 'Dialoghi', forced: false }
]).map(function (track) { return track.id; }), ['ass-match'], 'external ASS presentation matching must preserve format, source, title, language, and forced state');

var embeddedAssReference = {
  id: 'embedded-ass-current', index: 4, languageTag: 'it', codec: 'ASS', format: 'ass', external: false,
  title: 'Dialoghi', forced: false
};
assert.deepStrictEqual(SubtitleSeriesOffset.matchTracks(embeddedAssReference, [
  { id: 'embedded-ass-match', index: 4, languageTag: 'it', codec: 'ASS', format: 'ass', external: false, title: 'Dialoghi', forced: false },
  { id: 'embedded-ass-duplicate', index: 5, languageTag: 'it', codec: 'ASS', format: 'ass', external: false, title: 'Dialoghi', forced: false },
  { id: 'embedded-ssa-other-format', index: 4, languageTag: 'it', codec: 'SSA', format: 'ssa', external: false, title: 'Dialoghi', forced: false }
]).map(function (track) { return track.id; }), ['embedded-ass-match'], 'embedded ASS presentation matching must preserve stream index so duplicate tracks are not collapsed');

var values = {};
var storage = {
  getItem: function (key) { return values[key] || null; },
  setItem: function (key, value) { values[key] = value; }
};
var episode = { type: 'episode', ratingKey: 'episode-2', parentRatingKey: 'season-1' };
assert.strictEqual(SubtitleSeriesOffset.sourceFor({ media: { subtitleSize: 125 }, season: { offsetMs: 300 } }, 'offsetMs'), 'season',
  'source resolution must follow the layer that owns the requested presentation field');
assert.strictEqual(SubtitleSeriesOffset.sourceFor({ media: { subtitleSize: 125 }, season: { offsetMs: 300 } }, 'subtitleSize'), 'media',
  'media presentation must take precedence for its own field');
assert.strictEqual(SubtitleSeriesOffset.saveSeason(storage, 'server', episode, { subtitleSize: 125, offsetMs: 400, track: reference }), true);
assert.deepStrictEqual(SubtitleSeriesOffset.resolve(storage, 'server', episode, candidates[2]), {
  subtitleSize: 125, offsetMs: 400, track: SubtitleSeriesOffset.signature(reference)
}, 'season presentation must be restored for the equivalent subtitle track');
assert.strictEqual(SubtitleSeriesOffset.saveMedia(storage, 'server', episode, { subtitleSize: 150, offsetMs: -200, track: reference }), true);
assert.strictEqual(SubtitleSeriesOffset.resolve(storage, 'server', episode, candidates[2]).subtitleSize, 150,
  'the current-media presentation must override the season default');
assert.strictEqual(SubtitleSeriesOffset.resolve(storage, 'server', episode, candidates[0]), null,
  'an override must not leak to a different subtitle language');
assert.strictEqual(SubtitleSeriesOffset.saveSeason(storage, 'server', episode, { subtitleSize: 125, offsetMs: 650, track: embeddedAssReference }), true);
assert.strictEqual(SubtitleSeriesOffset.resolve(storage, 'server', episode, {
  id: 'embedded-ass-next', index: 4, languageTag: 'it', codec: 'ASS', format: 'ass', external: false, title: 'Dialoghi', forced: false
}).offsetMs, 650, 'season presentation must restore the equivalent embedded ASS stream by stable stream index');
assert.strictEqual(SubtitleSeriesOffset.resolve(storage, 'server', episode, {
  id: 'embedded-ass-wrong', index: 5, languageTag: 'it', codec: 'ASS', format: 'ass', external: false, title: 'Dialoghi', forced: false
}), null, 'season presentation must not leak to a duplicate embedded ASS stream with another index');


(function scopedLayerBatchUpdateWritesMediaAndSeasonAtomically() {
  var values = {};
  var writes = 0;
  var storage = {
    getItem: function (key) { return values[key] || null; },
    setItem: function (key, value) { writes += 1; values[key] = value; }
  };
  var detail = { type: 'episode', ratingKey: 'episode-batch', parentRatingKey: 'season-batch' };
  SubtitleSeriesOffset.saveSeason(storage, 'server', detail, { subtitleSize: 125 });
  writes = 0;
  assert.strictEqual(SubtitleSeriesOffset.updateLayers(storage, 'server', detail, { media: { subtitleBackground: 'high' }, season: null }), true,
    'layer batch update must support replacing media while deleting season');
  assert.strictEqual(writes, 1, 'media and season changes must be persisted with one storage write');
  assert.deepStrictEqual(SubtitleSeriesOffset.resolveLayers(storage, 'server', detail), { media: { subtitleBackground: 'high' }, season: null });
}());

console.log('Subtitle series offset checks passed');

(function runtimeOffsetInheritsSeasonWhenOnlySizeChanges() {
  var data = {};
  var memory = { getItem: function (key) { return data[key] || null; }, setItem: function (key, value) { data[key] = value; } };
  var detail = { type: 'episode', ratingKey: 'offset-episode', parentRatingKey: 'offset-season' };
  var track = { languageTag: 'it', format: 'srt', external: true, title: 'Dialoghi' };
  SubtitleSeriesOffset.saveProfile(memory, 'server|profile', detail, 'season', track, { offsetMs: 800 });
  SubtitleSeriesOffset.saveProfile(memory, 'server|profile', detail, 'media', track, { subtitleSize: 125 });
  assert.strictEqual(SubtitleSeriesOffset.resolve(memory, 'server|profile', detail, track).offsetMs, 800,
    'runtime offset resolution must merge the sparse media profile over the season');
  SubtitleSeriesOffset.saveProfile(memory, 'server|profile', detail, 'media', track, { subtitleSize: 125, offsetMs: 0 });
  assert.strictEqual(SubtitleSeriesOffset.resolve(memory, 'server|profile', detail, track).offsetMs, 0,
    'an explicit episode zero must still override the season offset');
}());

(function scopedSubtitlePresentationCascade() {
  var scopedValues = {};
  var scopedStorage = {
    getItem: function (key) { return scopedValues[key] || null; },
    setItem: function (key, value) { scopedValues[key] = value; },
    removeItem: function (key) { delete scopedValues[key]; }
  };
  var detail = { type: 'episode', ratingKey: 'episode-9', parentRatingKey: 'season-4' };
  var globals = {
    subtitleSize: 100,
    subtitleBackground: 'off',
    subtitleEdge: 'shadow',
    renderSrt: true,
    renderAss: false,
    offsetMs: 0
  };
  var seasonTrack = { id: 'season-it', languageTag: 'it', format: 'srt', codec: 'srt', external: true, title: 'Dialoghi', forced: false };
  var episodeTrack = { id: 'episode-it', languageTag: 'it', format: 'srt', codec: 'srt', external: true, title: 'Dialoghi', forced: false };

  assert.deepStrictEqual(SubtitleSeriesOffset.resolveLayers(scopedStorage, 'server', detail, episodeTrack), { media: null, season: null },
    'a media with no scoped subtitle preferences must expose empty media and season layers');
  assert.deepStrictEqual(SubtitleSeriesOffset.effective(scopedStorage, 'server', detail, globals, episodeTrack), globals,
    'global subtitle settings must be the bottom of the scoped cascade');

  SubtitleSeriesOffset.saveSeason(scopedStorage, 'server', detail, {
    subtitleSize: 125,
    subtitleBackground: 'medium',
    subtitleEdge: 'outline',
    renderSrt: false,
    renderAss: true,
    offsetMs: 350,
    track: seasonTrack,
    subtitleMode: 'track',
    subtitleTrack: seasonTrack
  });
  assert.deepStrictEqual(SubtitleSeriesOffset.effective(scopedStorage, 'server', detail, globals, episodeTrack), {
    subtitleSize: 125,
    subtitleBackground: 'medium',
    subtitleEdge: 'outline',
    renderSrt: true,
    renderAss: false,
    offsetMs: 350
  }, 'season presentation preferences must override global defaults while renderer flags remain global');
  assert.strictEqual(SubtitleSeriesOffset.resolveSelectedTrack(SubtitleSeriesOffset.effective(scopedStorage, 'server', detail, globals, episodeTrack), [episodeTrack]), null,
    'presentation profiles must not also become subtitle track-selection preferences');

  SubtitleSeriesOffset.saveMedia(scopedStorage, 'server', detail, {
    subtitleSize: 150,
    subtitleBackground: 'high',
    renderAss: false,
    subtitleMode: 'off'
  });
  assert.deepStrictEqual(SubtitleSeriesOffset.effective(scopedStorage, 'server', detail, globals, episodeTrack), {
    subtitleSize: 150,
    subtitleBackground: 'high',
    subtitleEdge: 'outline',
    renderSrt: true,
    renderAss: false,
    offsetMs: 350
  }, 'media preferences must override only their presentation fields while renderer flags remain global');

  assert.deepStrictEqual(SubtitleSeriesOffset.diff({ subtitleSize: 125, subtitleBackground: 'medium', renderSrt: false }, {
    subtitleSize: 125,
    subtitleBackground: 'high',
    renderSrt: false,
    renderAss: true
  }), { subtitleBackground: 'high' }, 'sparse diffs must ignore global renderer flags and omit values equal to the parent scope');

  assert.strictEqual(SubtitleSeriesOffset.clearMedia(scopedStorage, 'server', detail), true, 'media reset must delete only the media scope');
  assert.strictEqual(SubtitleSeriesOffset.effective(scopedStorage, 'server', detail, globals, episodeTrack).subtitleSize, 125,
    'clearing media preferences must reveal the season preference');
  assert.strictEqual(SubtitleSeriesOffset.clearSeason(scopedStorage, 'server', detail), true, 'season reset must delete only the season scope');
  assert.deepStrictEqual(SubtitleSeriesOffset.effective(scopedStorage, 'server', detail, globals, episodeTrack), globals,
    'clearing the season preference must reveal global defaults');

  SubtitleSeriesOffset.saveMedia(scopedStorage, 'server', detail, { offsetMs: -250, track: episodeTrack });
  assert.deepStrictEqual(SubtitleSeriesOffset.diff({ offsetMs: -250 }, { offsetMs: 0, track: episodeTrack }), { offsetMs: 0, track: SubtitleSeriesOffset.signature(episodeTrack) },
    'track profiles must compare structurally while an explicit zero offset remains a meaningful sparse override');
}());

(function multipleSubtitleProfilesRemainIndependentAndSeasonApplyClearsOnlyCurrentTrack() {
  var profileValues = {};
  var profileStorage = {
    getItem: function (key) { return profileValues[key] || null; },
    setItem: function (key, value) { profileValues[key] = value; },
    removeItem: function (key) { delete profileValues[key]; }
  };
  var detail = { type: 'episode', ratingKey: 'episode-profiles', parentRatingKey: 'season-profiles' };
  var italian = { id: 'it', languageTag: 'it', format: 'srt', codec: 'srt', external: true, title: 'Italiano', forced: false };
  var english = { id: 'en', languageTag: 'en', format: 'srt', codec: 'srt', external: true, title: 'English', forced: false };
  SubtitleSeriesOffset.saveProfile(profileStorage, 'server|profile-a', detail, 'media', italian, { offsetMs: 100 });
  SubtitleSeriesOffset.saveProfile(profileStorage, 'server|profile-a', detail, 'media', english, { offsetMs: -100 });
  assert.strictEqual(SubtitleSeriesOffset.resolve(profileStorage, 'server|profile-a', detail, italian).offsetMs, 100, 'each subtitle identity must retain its own media presentation');
  assert.strictEqual(SubtitleSeriesOffset.resolve(profileStorage, 'server|profile-a', detail, english).offsetMs, -100, 'changing language must not reuse another language profile');
  SubtitleSeriesOffset.updateProfileLayers(profileStorage, 'server|profile-a', detail, italian, { offsetMs: 250 }, true);
  assert.strictEqual(SubtitleSeriesOffset.resolve(profileStorage, 'server|profile-a', detail, italian).offsetMs, 250, 'season Apply must create the season profile for the active subtitle');
  assert.strictEqual(SubtitleSeriesOffset.resolve(profileStorage, 'server|profile-a', detail, english).offsetMs, -100, 'season Apply must preserve another subtitle profile on the same media');
  assert.strictEqual(SubtitleSeriesOffset.resolve(profileStorage, 'server|profile-b', detail, italian), null, 'subtitle presentation profiles must be isolated by Plex Home profile');
}());

(function seasonApplyMayPreserveOnlyDisabledMediaPresentationFields() {
  var data = {};
  var memory = {
    getItem: function (key) { return data[key] || null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; }
  };
  var detail = { type: 'episode', ratingKey: 'episode-disabled-fields', parentRatingKey: 'season-disabled-fields' };
  var track = { id: 'embedded-ass', index: 4, languageTag: 'it', format: 'ass', codec: 'ass', external: false, title: 'Dialoghi' };
  SubtitleSeriesOffset.saveProfile(memory, 'server|profile', detail, 'media', track, {
    subtitleSize: 150,
    offsetMs: 350
  });
  assert.strictEqual(SubtitleSeriesOffset.updateProfileLayers(memory, 'server|profile', detail, track,
    { offsetMs: 550 }, true, { subtitleSize: 150 }), true);
  assert.deepStrictEqual(SubtitleSeriesOffset.resolveLayers(memory, 'server|profile', detail, track), {
    media: { subtitleSize: 150, track: SubtitleSeriesOffset.signature(track) },
    season: { offsetMs: 550, track: SubtitleSeriesOffset.signature(track) }
  }, 'season Apply must remove enabled media fields while preserving only local-only fields disabled by current renderer ownership');
}());

(function legacyServerOnlyPresentationIsAdoptedOnceByActiveProfile() {
  var legacyValues = {};
  var legacyStorage = {
    getItem: function (key) { return legacyValues[key] || null; },
    setItem: function (key, value) { legacyValues[key] = value; },
    removeItem: function (key) { delete legacyValues[key]; }
  };
  var detail = { type: 'episode', ratingKey: 'episode-legacy', parentRatingKey: 'season-legacy' };
  var track = { languageTag: 'it', format: 'srt', external: true, title: 'Dialoghi', forced: false };
  var legacyIdentity = SubtitleSeriesOffset.signature(track);
  var legacyKey = encodeURIComponent('server-legacy') + '|media|' + encodeURIComponent(detail.ratingKey);
  legacyValues[SubtitleSeriesOffset.LEGACY_STORAGE_KEY] = JSON.stringify({});
  legacyValues[SubtitleSeriesOffset.LEGACY_STORAGE_KEY] = JSON.stringify((function () {
    var result = {};
    result[legacyKey] = { subtitleSize: 125, subtitleMode: 'track', subtitleTrack: legacyIdentity };
    return result;
  }()));
  assert.strictEqual(SubtitleSeriesOffset.resolve(legacyStorage, 'server-legacy|profile-a', detail, track).subtitleSize, 125,
    'server-only presentation records must migrate to the active profile when first opened');
  assert.strictEqual(SubtitleSeriesOffset.resolve(legacyStorage, 'server-legacy|profile-b', detail, track), null,
    'a migrated server-only record must not be exposed to another profile');
  assert.strictEqual(legacyStorage.getItem(SubtitleSeriesOffset.LEGACY_STORAGE_KEY), null, 'successful migration must remove the shared legacy record');
}());

(function externalTextProfileSurvivesBenignTitleChangesOnlyWhenUnambiguous() {
  var data = {};
  var memory = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; }
  };
  var detail = { type: 'episode', ratingKey: 'semantic-title-episode', parentRatingKey: 'semantic-title-season' };
  var saved = { languageTag: 'it', format: 'srt', external: true, title: 'Italiano - Dialoghi', forced: false };
  var renamed = { languageTag: 'it', format: 'srt', external: true, title: 'Italiano', forced: false };
  SubtitleSeriesOffset.saveProfile(memory, 'server|profile', detail, 'season', saved, { offsetMs: 275 });
  assert.strictEqual(SubtitleSeriesOffset.resolve(memory, 'server|profile', detail, renamed).offsetMs, 275,
    'an external SRT season profile must survive a descriptive title change when it has one semantic candidate');
  SubtitleSeriesOffset.saveProfile(memory, 'server|profile', detail, 'season', {
    languageTag: 'it', format: 'srt', external: true, title: 'Italiano - Signs', forced: false
  }, { offsetMs: 900 });
  assert.strictEqual(SubtitleSeriesOffset.resolve(memory, 'server|profile', detail, {
    languageTag: 'it', format: 'srt', external: true, title: 'Italiano generico', forced: false
  }), null, 'a loose SRT fallback must not guess when multiple stored profiles are semantically ambiguous');
}());


(function invalidProfileTargetCannotEraseExistingStore() {
  var data = {};
  var memory = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; }
  };
  var detail = { type: 'episode', ratingKey: 'safe-episode', parentRatingKey: 'safe-season' };
  var track = { languageTag: 'it', format: 'srt', external: true, title: 'Italiano', forced: false };
  assert.strictEqual(SubtitleSeriesOffset.saveProfile(memory, 'server|profile', detail, 'media', track, { offsetMs: 180 }), true);
  assert.strictEqual(SubtitleSeriesOffset.saveProfile(memory, 'server|profile', { type: 'episode' }, 'media', track, { offsetMs: 900 }), false,
    'an invalid media target must fail locally instead of serializing an empty replacement store');
  assert.strictEqual(SubtitleSeriesOffset.resolve(memory, 'server|profile', detail, track).offsetMs, 180,
    'a failed save with no rating key must preserve unrelated existing presentation profiles');
}());

(function seasonApplyRemovesRenamedEquivalentMediaProfile() {
  var data = {};
  var memory = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; }
  };
  var detail = { type: 'episode', ratingKey: 'rename-episode', parentRatingKey: 'rename-season' };
  var savedTrack = { languageTag: 'it', format: 'srt', external: true, title: 'Italiano - Dialoghi', forced: false };
  var currentTrack = { languageTag: 'it', format: 'srt', external: true, title: 'Italiano', forced: false };
  SubtitleSeriesOffset.saveProfile(memory, 'server|profile', detail, 'media', savedTrack, { offsetMs: 120 });
  assert.strictEqual(SubtitleSeriesOffset.updateProfileLayers(memory, 'server|profile', detail, currentTrack, { offsetMs: 360 }, true), true);
  assert.strictEqual(SubtitleSeriesOffset.resolveLayers(memory, 'server|profile', detail, currentTrack).media, null,
    'Apply to season must remove the current episode override when the same external text track only changed descriptive title');
  assert.strictEqual(SubtitleSeriesOffset.resolve(memory, 'server|profile', detail, currentTrack).offsetMs, 360,
    'the newly applied season profile must become effective after removing the equivalent episode override');
}());

(function rendererFlagsAreNeverScopedAndLegacyValuesAreIgnored() {
  var data = {};
  var memory = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; }
  };
  var detail = { type: 'episode', ratingKey: 'global-render-episode', parentRatingKey: 'global-render-season' };
  var track = { languageTag: 'it', format: 'srt', external: true, title: 'Italiano', forced: false };
  assert.strictEqual(SubtitleSeriesOffset.saveProfile(memory, 'server|profile', detail, 'media', track, {
    offsetMs: 250,
    renderSrt: true,
    renderAss: true
  }), true);
  var layer = SubtitleSeriesOffset.resolveLayers(memory, 'server|profile', detail, track).media;
  assert.strictEqual(layer.offsetMs, 250, 'ordinary scoped subtitle presentation values must still persist');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(layer, 'renderSrt'), false,
    'renderSrt must not be persisted or resolved at media/season scope');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(layer, 'renderAss'), false,
    'renderAss must not be persisted or resolved at media/season scope');
  var effective = SubtitleSeriesOffset.effective(memory, 'server|profile', detail, { renderSrt: false, renderAss: false, offsetMs: 0 }, track);
  assert.strictEqual(effective.renderSrt, false, 'global SRT rendering must not be overridden by scoped storage');
  assert.strictEqual(effective.renderAss, false, 'global ASS rendering must not be overridden by scoped storage');
}());
