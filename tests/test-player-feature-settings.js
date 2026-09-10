'use strict';

var assert = require('assert');
var InputCommandRouter = require('../app/coordinator/input-command-router');
var MediaPreferences = require('../app/media-preferences');
var SubtitleSeriesOffset = require('../app/subtitle-series-offset');
var VersionSelection = require('../app/version-selection');
var Fixture = require('./helpers/player-feature-controller-harness');
var fakeNode = Fixture.fakeNode;
var createHarness = Fixture.createHarness;

(function subtitleEditorTrackCyclingUsesPlaybackRuntimeAuthority() {
  var controls = ['track'].map(function (name) {
    var node = fakeNode('subtitle-authority-' + name);
    node.setAttribute('data-subtitle-editor', name);
    return node;
  });
  var choiceConfig = null;
  var playbackValue = {
    ratingKey: '42', requestedPlaybackMode: 'auto',
    options: { audioStreamID: '', subtitleStreamID: '', subtitleSize: 100, mediaIndex: 0, partIndex: 0, videoQuality: 'original', playbackMode: 'auto' },
    audioTracks: [], subtitleTracks: [
      { id: 'ass', codec: 'ass', format: 'ass', external: false },
      { id: 'srt', codec: 'srt', format: 'srt', external: false }
    ], mediaVersions: [], markers: [], chapters: []
  };
  var h = createHarness({
    playbackValue: playbackValue,
    dialogs: { openChoice: function (config) { choiceConfig = config; return true; } },
    SubtitleEditorView: {
      create: function () {
        return { setOpen: function () {}, hideOverlay: function () {}, render: function () {}, controls: function () { return controls; } };
      }
    },
    subtitleEditorAvailability: function (streamId, explicit) {
      if (!explicit) { return { enabled: true, reason: '' }; }
      return String(streamId || '') === 'srt' ? { enabled: true, reason: '' } : { enabled: false, reason: 'failed' };
    }
  });
  h.captured.controlsOptions.openSubtitleEditor();
  h.controller.handleSubtitleEditorKey({ keyCode: 13 }, '');
  assert.ok(choiceConfig && choiceConfig.choices.some(function (choice) { return choice.value === 'srt'; }),
    'track choice dialog must include tracks accepted by Playback runtime authority');
  assert.ok(!choiceConfig.choices.some(function (choice) { return choice.value === 'ass'; }),
    'track choice dialog must omit tracks rejected by Playback runtime authority');
  choiceConfig.apply({ value: 'srt' });
  assert.strictEqual(h.calls.filter(function (entry) {
    return entry[0] === 'open-subtitle-editor' && entry[1] && entry[1].action === 'set-track';
  })[0][1].streamId, 'srt', 'track choice must obey Playback runtime availability instead of duplicating codec policy in Player');
}());

(function subtitleEditorApplyPersistsMediaPresentationWithoutGlobalCommits() {
  var controls = ['track', 'size', 'background', 'edge', 'render-srt', 'render-ass', 'offset', 'loop', 'timeline', 'reset', 'cancel', 'apply-season', 'apply'].map(function (name) {
    var node = fakeNode('subtitle-scoped-' + name);
    node.setAttribute('data-subtitle-editor', name);
    return node;
  });
  var stored = {};
  var storage = {
    getItem: function (key) { return stored[key] || null; },
    setItem: function (key, value) { stored[key] = value; },
    removeItem: function (key) { delete stored[key]; }
  };
  var detail = { type: 'episode', ratingKey: 'episode-editor-1', parentRatingKey: 'season-editor-1' };
  var globalCommits = [];
  var previews = [];
  var choiceConfig = null;
  var playbackValue = {
    ratingKey: detail.ratingKey, requestedPlaybackMode: 'auto',
    options: { audioStreamID: '', subtitleStreamID: 'srt', subtitleSize: 100, mediaIndex: 0, partIndex: 0, videoQuality: 'original', playbackMode: 'auto' },
    audioTracks: [], subtitleTracks: [{ id: 'srt', languageTag: 'it', codec: 'srt', format: 'srt', external: true, title: 'Dialoghi' }],
    mediaVersions: [], markers: [], chapters: []
  };
  SubtitleSeriesOffset.saveSeason(storage, 'server-a', detail, { subtitleBackground: 'low', renderSrt: false });
  var h = createHarness({
    storage: storage,
    playbackValue: playbackValue,
    subtitleEditorState: {
      open: false, selectedStreamID: 'srt', subtitleSize: 100, offsetMs: 0,
      status: '', applying: false, previewMode: 'overlay', previewLoading: false, previewError: false
    },
    data: { activeServer: function () { return { machineIdentifier: 'server-a' }; } },
    dialogs: { openChoice: function (config) { choiceConfig = config; return true; } },
    detail: {
      snapshot: function () { return { currentDetail: detail, selectedItem: detail }; },
      playbackPreferences: function () { return {}; },
      saveMediaOverride: function () {}
    },
    SubtitleEditorView: {
      create: function () { return { setOpen: function () {}, hideOverlay: function () {}, render: function () {}, controls: function () { return controls; } }; }
    },
    settings: {
      settings: function () { return { subtitleRenderingSrt: true, subtitleRenderingAss: false, subtitleBackground: 'off', subtitleEdge: 'shadow', subtitlePosition: 7, subtitleSize: 100 }; },
      animationDuration: function () { return 0; }, videoQualityLabel: function (value) { return value; }, playbackPreferenceLabel: function (value) { return value; }, connectionRouteLabel: function () { return ''; },
      previewSubtitleStyle: function (value) { previews.push(value); },
      commitSubtitleStyle: function (value) { globalCommits.push(['style', value]); },
      restoreSubtitleStyle: function () {},
      commitSubtitleRendering: function (value) { globalCommits.push(['rendering', value]); }
    }
  });
  h.captured.controlsOptions.openSubtitleEditor();
  h.controller.pointerSubtitleFocus(controls[2]);
  h.controller.handleSubtitleEditorKey({ keyCode: 13 }, '');
  choiceConfig.apply({ value: 'medium' });
  h.controller.pointerSubtitleFocus(controls[3]);
  h.controller.handleSubtitleEditorKey({ keyCode: 13 }, '');
  choiceConfig.apply({ value: 'outline' });
  h.controller.pointerSubtitleFocus(controls[4]);
  h.controller.handleSubtitleEditorKey({ keyCode: 13 }, '');
  assert.strictEqual(choiceConfig.variant, 'confirm', 'renderer changes from the advanced editor must use the two-choice confirmation modal');
  assert.strictEqual(choiceConfig.selectedValue, 'no', 'renderer confirmation must default to the safe No choice');
  assert.deepStrictEqual(choiceConfig.choices.map(function (choice) { return choice.value; }), ['yes', 'no'],
    'renderer confirmation must expose only Yes and No');
  choiceConfig.apply({ value: 'no' });
  assert.deepStrictEqual(globalCommits, [], 'choosing No in the renderer confirmation must leave global settings untouched');
  h.controller.pointerSubtitleFocus(controls[12]);
  h.controller.handleSubtitleEditorKey({ keyCode: 13 }, '');
  assert.deepStrictEqual(globalCommits, [], 'Player subtitle editor Apply must never commit global subtitle Settings');
  assert.ok(previews.length > 0, 'scoped subtitle style must still preview while the editor is open');
  assert.deepStrictEqual(SubtitleSeriesOffset.resolveLayers(storage, 'server-a', detail, playbackValue.subtitleTracks[0]).media, {
    subtitleBackground: 'medium',
    subtitleEdge: 'outline',
    track: SubtitleSeriesOffset.signature(playbackValue.subtitleTracks[0])
  }, 'Apply must persist media presentation against the active subtitle identity');
}());

(function subtitleEditorApplySeasonPersistsSeasonAndClearsCurrentMediaLayer() {
  var controls = ['track', 'size', 'background', 'edge', 'render-srt', 'render-ass', 'offset', 'loop', 'timeline', 'reset', 'cancel', 'apply-season', 'apply'].map(function (name) {
    var node = fakeNode('subtitle-season-' + name);
    node.setAttribute('data-subtitle-editor', name);
    return node;
  });
  var stored = {};
  var storage = {
    getItem: function (key) { return stored[key] || null; },
    setItem: function (key, value) { stored[key] = value; }
  };
  var detail = { type: 'episode', ratingKey: 'episode-editor-2', parentRatingKey: 'season-editor-2' };
  var track = { id: 'episode-track', languageTag: 'it', codec: 'srt', format: 'srt', external: true, title: 'Dialoghi' };
  var playbackValue = {
    ratingKey: detail.ratingKey, requestedPlaybackMode: 'auto',
    options: { audioStreamID: '', subtitleStreamID: track.id, subtitleSize: 125, mediaIndex: 0, partIndex: 0, videoQuality: 'original', playbackMode: 'auto' },
    audioTracks: [], subtitleTracks: [track], mediaVersions: [], markers: [], chapters: []
  };
  SubtitleSeriesOffset.saveMedia(storage, 'server-a', detail, { subtitleSize: 125, subtitleBackground: 'high', offsetMs: 200 });
  var h = createHarness({
    storage: storage,
    playbackValue: playbackValue,
    subtitleEditorState: { open: false, selectedStreamID: track.id, subtitleSize: 125, offsetMs: 200, status: '', applying: false, previewMode: 'overlay', previewLoading: false, previewError: false },
    data: { activeServer: function () { return { machineIdentifier: 'server-a' }; } },
    detail: {
      snapshot: function () { return { currentDetail: detail, selectedItem: detail }; },
      playbackPreferences: function () { return {}; },
      saveMediaOverride: function () {}
    },
    SubtitleEditorView: {
      create: function () { return { setOpen: function () {}, hideOverlay: function () {}, render: function () {}, controls: function () { return controls; } }; }
    },
    settings: {
      settings: function () { return { subtitleRenderingSrt: true, subtitleRenderingAss: false, subtitleBackground: 'off', subtitleEdge: 'shadow', subtitlePosition: 7, subtitleSize: 100 }; },
      animationDuration: function () { return 0; }, videoQualityLabel: function (value) { return value; }, playbackPreferenceLabel: function (value) { return value; }, connectionRouteLabel: function () { return ''; },
      previewSubtitleStyle: function () {}, restoreSubtitleStyle: function () {},
      commitSubtitleStyle: function () { throw new Error('season Apply must not mutate global style'); },
      commitSubtitleRendering: function () { throw new Error('season Apply must not mutate global rendering'); }
    }
  });
  h.captured.controlsOptions.openSubtitleEditor();
  h.controller.pointerSubtitleFocus(controls[11]);
  h.controller.handleSubtitleEditorKey({ keyCode: 13 }, '');
  assert.strictEqual(SubtitleSeriesOffset.resolveLayers(storage, 'server-a', detail, track).media, null,
    'Apply to season must clear the current-media subtitle override so this episode follows the new season layer');
  assert.deepStrictEqual(SubtitleSeriesOffset.resolveLayers(storage, 'server-a', detail, track).season, {
    subtitleSize: 125,
    offsetMs: 200,
    track: SubtitleSeriesOffset.signature(track),
    subtitleBackground: 'high'
  }, 'Apply to season must persist the complete effective presentation for the current local SRT renderer');
}());

(function subtitleEditorCancelDiscardsScopedDraftAndRestoresPreviewOnly() {
  var controls = ['track', 'size', 'background', 'edge', 'render-srt', 'render-ass', 'offset', 'loop', 'timeline', 'reset', 'cancel', 'apply-season', 'apply'].map(function (name) {
    var node = fakeNode('subtitle-cancel-scoped-' + name);
    node.setAttribute('data-subtitle-editor', name);
    return node;
  });
  var stored = {};
  var storage = {
    getItem: function (key) { return stored[key] || null; },
    setItem: function (key, value) { stored[key] = value; }
  };
  var detail = { type: 'episode', ratingKey: 'episode-editor-3', parentRatingKey: 'season-editor-3' };
  SubtitleSeriesOffset.saveMedia(storage, 'server-a', detail, { subtitleBackground: 'low' });
  var before = storage.getItem(SubtitleSeriesOffset.STORAGE_KEY);
  var restores = [];
  var choiceConfig = null;
  var h = createHarness({
    storage: storage,
    playbackValue: {
      ratingKey: detail.ratingKey, requestedPlaybackMode: 'auto',
      options: { audioStreamID: '', subtitleStreamID: '', subtitleSize: 100, mediaIndex: 0, partIndex: 0, videoQuality: 'original', playbackMode: 'auto' },
      audioTracks: [], subtitleTracks: [], mediaVersions: [], markers: [], chapters: []
    },
    data: { activeServer: function () { return { machineIdentifier: 'server-a' }; } },
    dialogs: { openChoice: function (config) { choiceConfig = config; return true; } },
    detail: { snapshot: function () { return { currentDetail: detail, selectedItem: detail }; }, playbackPreferences: function () { return {}; }, saveMediaOverride: function () {} },
    SubtitleEditorView: { create: function () { return { setOpen: function () {}, hideOverlay: function () {}, render: function () {}, controls: function () { return controls; } }; } },
    settings: {
      settings: function () { return { subtitleRenderingSrt: false, subtitleRenderingAss: false, subtitleBackground: 'off', subtitleEdge: 'shadow', subtitlePosition: 7, subtitleSize: 100 }; },
      animationDuration: function () { return 0; }, videoQualityLabel: function (value) { return value; }, playbackPreferenceLabel: function (value) { return value; }, connectionRouteLabel: function () { return ''; },
      previewSubtitleStyle: function () {}, restoreSubtitleStyle: function (value) { restores.push(value); },
      commitSubtitleStyle: function () { throw new Error('Cancel must never commit global style'); },
      commitSubtitleRendering: function () { throw new Error('Cancel must never commit global rendering'); }
    }
  });
  h.captured.controlsOptions.openSubtitleEditor();
  h.controller.pointerSubtitleFocus(controls[2]);
  h.controller.handleSubtitleEditorKey({ keyCode: 13 }, '');
  choiceConfig.apply({ value: 'medium' });
  h.controller.pointerSubtitleFocus(controls[10]);
  h.controller.handleSubtitleEditorKey({ keyCode: 13 }, '');
  assert.strictEqual(storage.getItem(SubtitleSeriesOffset.STORAGE_KEY), before, 'Cancel must persist no scoped subtitle changes');
  assert.strictEqual(restores.length, 1, 'Cancel must restore the effective scoped style that was active before opening the editor');
  assert.strictEqual(restores[0].subtitleBackground, 'low');
}());


(function scopedSubtitleRenderingFlagsAreIgnoredInFavorOfGlobalSettings() {
  var stored = {};
  var storage = {
    getItem: function (key) { return stored[key] || null; },
    setItem: function (key, value) { stored[key] = value; }
  };
  var detail = { type: 'episode', ratingKey: 'episode-render-runtime', parentRatingKey: 'season-render-runtime' };
  SubtitleSeriesOffset.saveSeason(storage, 'server-a', detail, { renderSrt: true, renderAss: false });
  var h = createHarness({
    storage: storage,
    data: { activeServer: function () { return { machineIdentifier: 'server-a' }; } },
    detail: { snapshot: function () { return { currentDetail: detail, selectedItem: detail }; }, playbackPreferences: function () { return {}; } },
    settings: {
      settings: function () { return { subtitleRenderingSrt: false, subtitleRenderingAss: true, subtitleBackground: 'off', subtitleEdge: 'shadow', subtitlePosition: 7, subtitleSize: 100 }; },
      animationDuration: function () { return 0; }, videoQualityLabel: function (value) { return value; }, playbackPreferenceLabel: function (value) { return value; }, connectionRouteLabel: function () { return ''; }
    }
  });
  assert.deepStrictEqual(h.captured.playbackOptions.subtitleRendering(), { srt: false, ass: true },
    'Playback local subtitle rendering must ignore legacy media/season renderer flags and use global Settings only');
}());

(function assRenderingIsNeverPersistedInMediaScopeOnApply() {
  var controls = ['track', 'size', 'background', 'edge', 'render-srt', 'render-ass', 'offset', 'loop', 'timeline', 'reset', 'cancel', 'apply-season', 'apply'].map(function (name) {
    var node = fakeNode('subtitle-ass-scoped-' + name);
    node.setAttribute('data-subtitle-editor', name);
    return node;
  });
  var stored = {};
  var storage = {
    getItem: function (key) { return stored[key] || null; },
    setItem: function (key, value) { stored[key] = value; }
  };
  var detail = { type: 'episode', ratingKey: 'episode-ass-scoped', parentRatingKey: 'season-ass-scoped' };
  var track = { id: 'ass', languageTag: 'it', codec: 'ass', format: 'ass', external: false, index: 2, title: 'Signs' };
  var commits = [];
  var h = createHarness({
    storage: storage,
    subtitleEditorState: { open: false, selectedStreamID: track.id, subtitleSize: 100, offsetMs: 0, status: '', applying: false, previewMode: 'ass' },
    playbackValue: {
      ratingKey: detail.ratingKey, requestedPlaybackMode: 'auto',
      options: { audioStreamID: '', subtitleStreamID: track.id, subtitleSize: 100, mediaIndex: 0, partIndex: 0, videoQuality: 'original', playbackMode: 'auto' },
      audioTracks: [], subtitleTracks: [track], mediaVersions: [], markers: [], chapters: []
    },
    data: { activeServer: function () { return { machineIdentifier: 'server-a' }; } },
    detail: { snapshot: function () { return { currentDetail: detail, selectedItem: detail }; }, playbackPreferences: function () { return {}; }, saveMediaOverride: function () {} },
    SubtitleEditorView: { create: function () { return { setOpen: function () {}, hideOverlay: function () {}, render: function () {}, controls: function () { return controls; } }; } },
    settings: {
      settings: function () { return { subtitleRenderingSrt: false, subtitleRenderingAss: false, subtitleBackground: 'off', subtitleEdge: 'shadow', subtitlePosition: 7, subtitleSize: 100 }; },
      animationDuration: function () { return 0; }, videoQualityLabel: function (value) { return value; }, playbackPreferenceLabel: function (value) { return value; }, connectionRouteLabel: function () { return ''; },
      previewSubtitleStyle: function () {}, restoreSubtitleStyle: function () {},
      commitSubtitleStyle: function () { commits.push('style'); }, commitSubtitleRendering: function () { commits.push('rendering'); }
    }
  });
  h.captured.controlsOptions.openSubtitleEditor();
  h.controller.pointerSubtitleFocus(controls[12]);
  h.controller.handleSubtitleEditorKey({ keyCode: 13 }, '');
  assert.deepStrictEqual(commits, [], 'Apply without an explicit renderer confirmation must never write global Settings');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(SubtitleSeriesOffset.resolveLayers(storage, 'server-a', detail, track).media || {}, 'renderAss'), false,
    'ASS rendering must never persist in the media subtitle layer');
}());

(function advancedApplyPersistsSelectionWithoutCouplingOffsetScope() {
  var stored = {};
  var storage = {
    getItem: function (key) { return stored[key] || null; },
    setItem: function (key, value) { stored[key] = value; },
    removeItem: function (key) { delete stored[key]; }
  };
  var detail = { type: 'episode', ratingKey: 'editor-selection', parentRatingKey: 'editor-season' };
  var identity = 'server-a|profile-a';
  var italian = { id: 'it', languageTag: 'it', format: 'srt', external: true };
  var english = { id: 'en', languageTag: 'en', format: 'srt', external: true };
  var playback = { options: { subtitleStreamID: 'it', subtitleSize: 100 }, subtitleTracks: [italian, english], audioTracks: [], mediaVersions: [], markers: [], chapters: [] };
  var h = createHarness({
    storage: storage, playbackValue: playback,
    data: { mediaIdentity: function () { return { server: 'server-a', profile: 'profile-a' }; } },
    detail: {
      snapshot: function () { return { currentDetail: detail }; },
      setTrackPreference: function (kind, track, off) {
        MediaPreferences.updateSelection(storage, identity, detail, { subtitleTrack: MediaPreferences.trackPreference(track), subtitlesOff: off });
      }
    }
  });
  var save = h.captured.subtitleEditorOptions.presentation.save;
  var draft = {
    state: { selectedStreamID: 'en', subtitleSize: 125, offsetMs: 250 },
    style: { subtitleBackground: 'off', subtitleEdge: 'shadow' }, rendering: { srt: true, ass: false },
    trackChanged: true, trackIntent: 'track'
  };
  SubtitleSeriesOffset.saveProfile(storage, identity, detail, 'season', italian, { offsetMs: 250 });
  assert.strictEqual(save('media', draft), true);
  assert.strictEqual(MediaPreferences.loadScopes(storage, identity, detail).season.subtitleTrack.language, 'en',
    'editor track choice must share season selection memory');
  assert.strictEqual(SubtitleSeriesOffset.resolveLayers(storage, identity, detail, english).media.offsetMs, 250,
    'offset must be compared to the chosen language parent, not the previously playing language');
  assert.strictEqual(SubtitleSeriesOffset.resolveLayers(storage, identity, detail, english).season, null,
    'normal Apply must not extend offset to the season');
  assert.strictEqual(save('season', draft), true);
  assert.strictEqual(SubtitleSeriesOffset.resolveLayers(storage, identity, detail, english).media, null);
  assert.strictEqual(SubtitleSeriesOffset.resolveLayers(storage, identity, detail, english).season.offsetMs, 250);
  assert.strictEqual(SubtitleSeriesOffset.resolveLayers(storage, identity, detail, italian).season.offsetMs, 250,
    'season Apply must preserve other language profiles');
  draft.state.selectedStreamID = '';
  draft.trackIntent = 'off';
  assert.strictEqual(save('media', draft), true);
  assert.strictEqual(MediaPreferences.loadScopes(storage, identity, detail).season.subtitlesOff, true,
    'Off from the advanced editor must persist even without a selected style track');
  draft.state.selectedStreamID = 'en';
  draft.trackIntent = 'inherit';
  assert.strictEqual(save('media', draft), true);
  assert.strictEqual(MediaPreferences.loadScopes(storage, identity, detail).season, null,
    'Default from the advanced editor must clear the explicit selection');
  draft.trackChanged = false;
  assert.strictEqual(save('media', draft), true);
  assert.strictEqual(MediaPreferences.loadScopes(storage, identity, detail).season, null,
    'offset-only Apply must not persist an automatic fallback as a track preference');
  assert.strictEqual(save('season', draft), true);
  assert.strictEqual(MediaPreferences.loadScopes(storage, identity, detail).season, null,
    'season Apply must not capture an inherited runtime fallback when the track control was untouched');
}());

(function advancedApplyPersistsOnlyCapabilitiesRelevantToTheSelectedRenderer() {
  var stored = {};
  var storage = {
    getItem: function (key) { return stored[key] || null; },
    setItem: function (key, value) { stored[key] = value; },
    removeItem: function (key) { delete stored[key]; }
  };
  var detail = { type: 'episode', ratingKey: 'embedded-ass-capabilities', parentRatingKey: 'embedded-ass-season' };
  var track = { id: 'ass-embedded', languageTag: 'it', codec: 'ass', format: 'ass', external: false, location: 'embedded' };
  var playback = {
    options: { subtitleStreamID: track.id, subtitleSize: 100 },
    subtitleTracks: [track], audioTracks: [], mediaVersions: [], markers: [], chapters: []
  };
  var h = createHarness({
    storage: storage,
    playbackValue: playback,
    data: { mediaIdentity: function () { return { server: 'server-a', profile: 'profile-a' }; } },
    detail: { snapshot: function () { return { currentDetail: detail }; }, setTrackPreference: function () {} }
  });
  var save = h.captured.subtitleEditorOptions.presentation.save;
  assert.strictEqual(save('media', {
    state: { selectedStreamID: track.id, subtitleSize: 150, offsetMs: 350 },
    style: { subtitleBackground: 'opaque', subtitleEdge: 'double-outline-shadow' },
    capabilities: { size: true, offset: true, background: false, edge: false },
    trackChanged: false
  }), true);
  var media = SubtitleSeriesOffset.resolveLayers(storage, 'server-a|profile-a', detail, track).media;
  assert.strictEqual(media.subtitleSize, 150, 'local embedded ASS must persist applicable size');
  assert.strictEqual(media.offsetMs, 350, 'embedded ASS must persist applicable timing');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(media, 'subtitleBackground'), false,
    'ASS must not persist SRT-only background style');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(media, 'subtitleEdge'), false,
    'ASS must not persist SRT-only edge style');

  assert.strictEqual(save('media', {
    state: { selectedStreamID: track.id, subtitleSize: 200, offsetMs: 450 },
    style: { subtitleBackground: 'medium', subtitleEdge: 'outline' },
    capabilities: { size: false, offset: true, background: false, edge: false },
    trackChanged: false
  }), true);
  media = SubtitleSeriesOffset.resolveLayers(storage, 'server-a|profile-a', detail, track).media;
  assert.strictEqual(media.subtitleSize, 150,
    'server-owned embedded ASS must not overwrite the last applicable local size');
  assert.strictEqual(media.offsetMs, 450, 'server-owned embedded ASS may still update timing');

  assert.strictEqual(save('season', {
    state: { selectedStreamID: track.id, subtitleSize: 200, offsetMs: 550 },
    style: { subtitleBackground: 'medium', subtitleEdge: 'outline' },
    capabilities: { size: false, offset: true, background: false, edge: false },
    trackChanged: false
  }), true);
  var layers = SubtitleSeriesOffset.resolveLayers(storage, 'server-a|profile-a', detail, track);
  assert.strictEqual(layers.season.offsetMs, 550,
    'season Apply must propagate the timing field that remains applicable under server ownership');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(layers.season, 'subtitleSize'), false,
    'season Apply must not promote a disabled local-only ASS size');
  assert.strictEqual(layers.media.subtitleSize, 150,
    'season Apply must preserve a media-local size that remains meaningful when ASS returns to local rendering');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(layers.media, 'offsetMs'), false,
    'season Apply must remove the superseded media timing field so the new season timing is effective');
  assert.deepStrictEqual(SubtitleSeriesOffset.effective(storage, 'server-a|profile-a', detail, {}, track), {
    offsetMs: 550,
    subtitleSize: 150
  }, 'effective presentation must combine the new season timing with the preserved media-local size');
}());

(function serverOwnedSrtDoesNotErasePresentationSavedForItsLocalRenderer() {
  var stored = {};
  var storage = {
    getItem: function (key) { return stored[key] || null; },
    setItem: function (key, value) { stored[key] = value; },
    removeItem: function (key) { delete stored[key]; }
  };
  var detail = { type: 'episode', ratingKey: 'srt-capabilities', parentRatingKey: 'srt-season' };
  var track = { id: 'srt-external', languageTag: 'it', codec: 'srt', format: 'srt', external: true, key: '/subtitles/it.srt' };
  var playback = {
    options: { subtitleStreamID: track.id, subtitleSize: 100 },
    subtitleTracks: [track], audioTracks: [], mediaVersions: [], markers: [], chapters: []
  };
  var h = createHarness({
    storage: storage,
    playbackValue: playback,
    data: { mediaIdentity: function () { return { server: 'server-a', profile: 'profile-a' }; } },
    detail: { snapshot: function () { return { currentDetail: detail }; }, setTrackPreference: function () {} }
  });
  var save = h.captured.subtitleEditorOptions.presentation.save;
  assert.strictEqual(save('media', {
    state: { selectedStreamID: track.id, subtitleSize: 150, offsetMs: 200 },
    style: { subtitleBackground: 'high', subtitleEdge: 'outline' },
    capabilities: { size: true, offset: true, background: true, edge: true },
    trackChanged: false
  }), true);
  assert.strictEqual(save('media', {
    state: { selectedStreamID: track.id, subtitleSize: 200, offsetMs: 350 },
    style: { subtitleBackground: 'off', subtitleEdge: 'shadow' },
    capabilities: { size: false, offset: true, background: false, edge: false },
    trackChanged: false
  }), true);
  var media = SubtitleSeriesOffset.resolveLayers(storage, 'server-a|profile-a', detail, track).media;
  assert.strictEqual(media.subtitleSize, 150,
    'server-owned SRT must preserve the size previously saved for local rendering');
  assert.strictEqual(media.subtitleBackground, 'high',
    'server-owned SRT must preserve its local-only background preference');
  assert.strictEqual(media.subtitleEdge, 'outline',
    'server-owned SRT must preserve its local-only edge preference');
  assert.strictEqual(media.offsetMs, 350, 'server-owned SRT may still update timing');
  assert.strictEqual(save('season', {
    state: { selectedStreamID: track.id, subtitleSize: 200, offsetMs: 450 },
    style: { subtitleBackground: 'off', subtitleEdge: 'shadow' },
    capabilities: { size: false, offset: true, background: false, edge: false },
    trackChanged: false
  }), true);
  var layers = SubtitleSeriesOffset.resolveLayers(storage, 'server-a|profile-a', detail, track);
  assert.strictEqual(layers.season.offsetMs, 450);
  assert.deepStrictEqual(layers.media, {
    subtitleSize: 150,
    subtitleBackground: 'high',
    subtitleEdge: 'outline',
    track: SubtitleSeriesOffset.signature(track)
  }, 'server-owned season Apply must preserve media-local SRT appearance while removing the superseded media timing');
}());

(function legacySubtitleOffsetIdentityRemainsServerScoped() {
  var h = createHarness({
    data: {
      activeServer: function () { return { machineIdentifier: 'server-a' }; },
      mediaIdentity: function () { return { server: 'server-a', profile: 'profile-a' }; }
    }
  });
  assert.strictEqual(h.captured.playbackOptions.subtitleIdentity(), 'server-a',
    'legacy per-stream subtitle offsets must remain readable under their v1 server-only identity');
}());

(function queueCaptureUsesCommandRouterForEffects() {
  var routed = 0;
  var h = createHarness({
    queueSnapshot: { playlistQueue: { id: 'queue' }, drawer: { open: true, index: 1 }, directPlayPending: false, destroyed: false },
    InputCommandRouter: {
      playerQueue: function () { routed += 1; return 'drawer-down'; },
      settings: InputCommandRouter.settings
    }
  });
  h.controller.handleQueueCapture({ keyCode: 999, preventDefault: function () {} });
  assert.strictEqual(routed, 1, 'queue capture must delegate command selection to InputCommandRouter');
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'move-drawer' && entry[1] === 1; }),
    'the controller must keep the drawer movement effect while the router owns command selection');
}());

(function playerSubtitleChoicesUseAutomaticLabel() {
  var choiceConfig = null;
  var rows = [fakeNode('setting-0'), fakeNode('setting-1'), fakeNode('setting-subtitles')];
  rows[2].getAttribute = function (name) { return name === 'data-setting' ? 'subtitles' : ''; };
  var h = createHarness({
    querySelectorAll: function (selector) { return selector === '.setting-row, .playback-info' ? rows : []; },
    playbackValue: {
      ratingKey: '42',
      options: { audioStreamID: '', subtitleStreamID: '', subtitleSize: 100, mediaIndex: 0, partIndex: 0, videoQuality: 'original', playbackMode: 'auto' },
      audioTracks: [],
      subtitleTracks: [{ id: 's1', languageTag: 'it', codec: 'srt', format: 'srt', external: true }],
      mediaVersions: [], markers: [], chapters: []
    },
    dialogs: { openChoice: function (config) { choiceConfig = config; return true; } }
  });
  h.captured.controlsOptions.openSettingChoice('subtitles');
  assert.strictEqual(choiceConfig.choices[0].label, 'player.automatic',
    'Player subtitle selectors must use the same Automatic wording as the shared automatic mode');
}());

(function playerSubtitleQuickControlsPersistOnlyMediaScope() {
  var stored = {};
  var storage = {
    getItem: function (key) { return stored[key] || null; },
    setItem: function (key, value) { stored[key] = value; },
    removeItem: function (key) { delete stored[key]; }
  };
  var detail = { type: 'episode', ratingKey: 'episode-42', parentRatingKey: 'season-7' };
  var trackCalls = [];
  var playbackValue = {
    ratingKey: 'episode-42', requestedPlaybackMode: 'auto',
    options: { audioStreamID: 'a1', subtitleStreamID: 's1', subtitleSize: 100, mediaIndex: 0, partIndex: 0, videoQuality: 'original', playbackMode: 'auto' },
    audioTracks: [{ id: 'a1', languageTag: 'it', codec: 'aac', channels: 2 }],
    subtitleTracks: [
      { id: 's1', languageTag: 'it', codec: 'srt', format: 'srt', external: true, title: 'Dialoghi', forced: false },
      { id: 's2', languageTag: 'en', codec: 'srt', format: 'srt', external: true, title: 'English', forced: false }
    ],
    mediaVersions: [], markers: [], chapters: []
  };
  var h = createHarness({
    storage: storage,
    playbackValue: playbackValue,
    data: { activeServer: function () { return { machineIdentifier: 'server-a' }; } },
    detail: {
      snapshot: function () { return { currentDetail: detail, selectedItem: detail }; },
      playbackPreferences: function () { return {}; },
      setTrackPreference: function (kind, track, off) {
        trackCalls.push([kind, track && track.id, off]);
        if (kind === 'subtitles') {
          MediaPreferences.updateSelection(storage, MediaPreferences.identity('server-a', 'profile-a'), detail, { subtitleTrack: MediaPreferences.trackPreference(track), subtitlesOff: off === true });
        } else {
          MediaPreferences.updateSelection(storage, MediaPreferences.identity('server-a', 'profile-a'), detail, { audioTrack: MediaPreferences.trackPreference(track) });
        }
      },
      saveMediaOverride: function () {}
    }
  });

  h.captured.controlsOptions.changeTrack('subtitles', 's2');
  assert.deepStrictEqual(trackCalls, [['subtitles', 's2', false]], 'Player subtitle choices must use the shared preference owner');
  assert.deepStrictEqual(MediaPreferences.loadScopes(storage, MediaPreferences.identity('server-a', 'profile-a'), detail).season.subtitleTrack,
    MediaPreferences.trackPreference(playbackValue.subtitleTracks[1]), 'a concrete Player subtitle choice must persist at season scope');

  h.captured.controlsOptions.changeSetting('size', '125');
  assert.strictEqual(SubtitleSeriesOffset.resolveLayers(storage, 'server-a', detail, playbackValue.subtitleTracks[1]).media.subtitleSize, 125,
    'Player subtitle size must be persisted in the current-media subtitle layer');

  h.captured.controlsOptions.changeTrack('audio', 'a1');
  assert.deepStrictEqual(trackCalls, [['subtitles', 's2', false], ['audio', 'a1', false]], 'audio preference ownership must remain shared with Detail');
}());

(function playerSubtitleQuickControlsKeepOffsetsScopedToEachTrack() {
  var stored = {};
  var storage = {
    getItem: function (key) { return stored[key] || null; },
    setItem: function (key, value) { stored[key] = value; },
    removeItem: function (key) { delete stored[key]; }
  };
  var detail = { type: 'episode', ratingKey: 'episode-offsets', parentRatingKey: 'season-offsets' };
  var firstTrack = { id: 's1', languageTag: 'it', codec: 'srt', format: 'srt', external: true, title: 'Italiano', forced: false, offset: 450 };
  var secondTrack = { id: 's2', languageTag: 'en', codec: 'srt', format: 'srt', external: true, title: 'English', forced: false, offset: -200 };
  var playbackValue = {
    ratingKey: detail.ratingKey, partId: 'part-offsets', requestedPlaybackMode: 'auto',
    options: { audioStreamID: '', subtitleStreamID: firstTrack.id, subtitleSize: 100, mediaIndex: 0, partIndex: 0, videoQuality: 'original', playbackMode: 'auto' },
    audioTracks: [], subtitleTracks: [firstTrack, secondTrack], mediaVersions: [], markers: [], chapters: []
  };
  SubtitleSeriesOffset.saveMedia(storage, 'server-a', detail, {
    subtitleMode: 'track', subtitleTrack: firstTrack, offsetMs: 450, track: firstTrack
  });
  SubtitleSeriesOffset.saveMedia(storage, 'server-a', detail, { offsetMs: -200, track: secondTrack });
  var h = createHarness({
    storage: storage,
    playbackValue: playbackValue,
    data: { activeServer: function () { return { machineIdentifier: 'server-a' }; } },
    detail: {
      snapshot: function () { return { currentDetail: detail, selectedItem: detail }; },
      playbackPreferences: function () { return {}; },
      setTrackPreference: function () {},
      saveMediaOverride: function () {}
    }
  });

  h.captured.controlsOptions.changeTrack('subtitles', secondTrack.id);
  assert.strictEqual(SubtitleSeriesOffset.resolve(storage, 'server-a', detail, secondTrack).offsetMs, -200,
    'changing subtitle track must restore the target stream offset instead of carrying the previous stream offset');
  assert.deepStrictEqual(SubtitleSeriesOffset.resolve(storage, 'server-a', detail, secondTrack).track,
    SubtitleSeriesOffset.signature(secondTrack), 'the restored offset must remain constrained to its subtitle stream');

  h.captured.controlsOptions.changeTrack('subtitles', firstTrack.id);
  assert.strictEqual(SubtitleSeriesOffset.resolve(storage, 'server-a', detail, firstTrack).offsetMs, 450,
    'returning to a subtitle track must restore that stream own persisted offset');
  assert.deepStrictEqual(SubtitleSeriesOffset.resolve(storage, 'server-a', detail, firstTrack).track,
    SubtitleSeriesOffset.signature(firstTrack), 'switching back must restore the matching stream constraint');
}());

(function playerSubtitleAutomaticChoiceClearsSeasonSelectionAndKeepsPresentationProfiles() {
  var stored = {};
  var storage = {
    getItem: function (key) { return stored[key] || null; },
    setItem: function (key, value) { stored[key] = value; },
    removeItem: function (key) { delete stored[key]; }
  };
  var detail = { type: 'episode', ratingKey: 'episode-43', parentRatingKey: 'season-7' };
  var seasonReference = { id: 'old-id', languageTag: 'it', codec: 'srt', format: 'srt', external: true, title: 'Dialoghi', forced: false };
  var playbackValue = {
    ratingKey: 'episode-43', requestedPlaybackMode: 'auto',
    options: { audioStreamID: '', subtitleStreamID: 'en', subtitleSize: 100, mediaIndex: 0, partIndex: 0, videoQuality: 'original', playbackMode: 'auto' },
    audioTracks: [],
    subtitleTracks: [
      { id: 'it-current', languageTag: 'it', codec: 'srt', format: 'srt', external: true, title: 'Dialoghi', forced: false },
      { id: 'en', languageTag: 'en', codec: 'srt', format: 'srt', external: true, title: 'English', forced: false }
    ], mediaVersions: [], markers: [], chapters: []
  };
  MediaPreferences.updateSelection(storage, MediaPreferences.identity('server-a', 'profile-a'), detail, {
    subtitleTrack: MediaPreferences.trackPreference(seasonReference)
  });
  SubtitleSeriesOffset.saveProfile(storage, 'server-a', detail, 'media', playbackValue.subtitleTracks[1], { subtitleSize: 125 });

  var h = createHarness({
    storage: storage,
    playbackValue: playbackValue,
    data: { activeServer: function () { return { machineIdentifier: 'server-a' }; } },
    detail: {
      snapshot: function () { return { currentDetail: detail, selectedItem: detail }; },
      playbackPreferences: function () { return {}; },
      resolvePlaybackTracks: function (playback) {
        return MediaPreferences.resolve(playback, MediaPreferences.effectiveSelection(MediaPreferences.loadScopes(storage, MediaPreferences.identity('server-a', 'profile-a'), detail), detail), {
          subtitleMode: 'always', subtitleLanguages: ['it']
        });
      },
      setTrackPreference: function (kind, track, off) {
        if (kind === 'subtitles') { MediaPreferences.updateSelection(storage, MediaPreferences.identity('server-a', 'profile-a'), detail, { subtitleTrack: MediaPreferences.trackPreference(track), subtitlesOff: off === true }); }
      },
      saveMediaOverride: function () {}
    }
  });

  h.captured.controlsOptions.changeTrack('subtitles', '__automatic__');
  assert.strictEqual(MediaPreferences.loadScopes(storage, MediaPreferences.identity('server-a', 'profile-a'), detail).season, null,
    'the Automatic Player choice must remove the season subtitle selection');
  assert.strictEqual(SubtitleSeriesOffset.resolveLayers(storage, 'server-a', detail, playbackValue.subtitleTracks[1]).media.subtitleSize, 125,
    'clearing a track selection must preserve unrelated media presentation overrides');
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'change-track' && entry[1] === 'subtitles' && entry[2] === 'it-current'; }),
    'Automatic subtitles must immediately resolve through the shared global resolver');
}());

(function scopedSubtitlePreferenceOverridesLegacySubtitlePreferenceAtPlaybackStart() {
  var stored = {};
  var storage = {
    getItem: function (key) { return stored[key] || null; },
    setItem: function (key, value) { stored[key] = value; },
    removeItem: function (key) { delete stored[key]; }
  };
  var detail = { type: 'episode', ratingKey: 'episode-44', parentRatingKey: 'season-8' };
  var track = { id: 'season-track', languageTag: 'it', codec: 'srt', format: 'srt', external: true, title: 'Dialoghi', forced: false };
  SubtitleSeriesOffset.saveSeason(storage, 'server-a', detail, { subtitleSize: 125, track: track });
  var h = createHarness({
    storage: storage,
    data: { activeServer: function () { return { machineIdentifier: 'server-a' }; } },
    detail: {
      snapshot: function () { return { currentDetail: detail, selectedItem: detail }; },
      playbackPreferences: function () {
        return { subtitleMode: 'always', subtitleTrackPreference: MediaPreferences.trackPreference(track), subtitleSuppressedForAudio: [] };
      }
    },
    settings: {
      settings: function () { return { subtitleMode: 'audio-mismatch', subtitleSuppressedForAudio: [], subtitleSize: 100 }; },
      animationDuration: function (delay) { return delay; },
      videoQualityLabel: function (value) { return value; },
      playbackPreferenceLabel: function (value) { return value; },
      connectionRouteLabel: function () { return ''; }
    }
  });
  var preferences = h.captured.playbackOptions.playbackPreferences ? h.captured.playbackOptions.playbackPreferences({}) : null;
  assert.strictEqual(preferences.subtitleSize, 125, 'season subtitle size must be restored when playback is opened again');
  assert.strictEqual(preferences.subtitleMode, 'always', 'the shared detail resolver must retain the selected subtitle mode at playback start');
  assert.deepStrictEqual(preferences.subtitleTrackPreference, MediaPreferences.trackPreference(track),
    'the shared detail resolver must pass the semantic subtitle identity at playback start');
  assert.deepStrictEqual(preferences.subtitleSuppressedForAudio, [], 'scoped subtitle selection must not be suppressed by the global audio suppression list');
}());


(function playerVersionCycleTracksResolvedSeasonAffinityAcrossEpisodeBitratesAndOrder() {
  var saved = [];
  var detail = { type: 'episode', ratingKey: 'episode-version-affinity', parentRatingKey: 'season-version-affinity' };
  var preferred = { videoCodec: 'hevc', container: 'mkv', width: 3840, height: 2160, bitrate: 20000, hdr: 1 };
  var playbackValue = {
    ratingKey: detail.ratingKey,
    requestedPlaybackMode: 'auto',
    options: { audioStreamID: '', subtitleStreamID: '', subtitleSize: 100, mediaIndex: 0, partIndex: 0, videoQuality: 'original', playbackMode: 'auto' },
    audioTracks: [], subtitleTracks: [],
    mediaVersions: [
      { mediaIndex: 1, partIndex: 0, summary: '1080p', videoCodec: 'h264', container: 'mp4', width: 1920, height: 1080, bitrate: 8000, videoDynamicRange: 'SDR' },
      { mediaIndex: 0, partIndex: 0, summary: '4K', videoCodec: 'hevc', container: 'mkv', width: 3840, height: 2160, bitrate: 14500, videoDynamicRange: 'HDR10' }
    ], markers: [], chapters: []
  };
  var h = createHarness({
    playbackValue: playbackValue,
    detail: {
      preferenceSnapshot: function () { return { override: { versionSignature: preferred } }; },
      setPlaybackVersion: function (mediaIndex, partIndex) { saved.push([mediaIndex, partIndex]); }
    },
    VersionSelection: VersionSelection
  });
  h.captured.controlsOptions.changeVersion(1);
  assert.deepStrictEqual(saved[0], [null, null],
    'cycling forward from the physically resolved affine version must move to Automatic even when bitrate and ordering differ');
}());

(function playerVersionCycleTreatsMissingPreferredVersionAsAutomaticFallback() {
  var saved = [];
  var playbackValue = {
    ratingKey: 'episode-version-missing', requestedPlaybackMode: 'auto',
    options: { audioStreamID: '', subtitleStreamID: '', subtitleSize: 100, mediaIndex: 0, partIndex: 0, videoQuality: 'original', playbackMode: 'auto' },
    audioTracks: [], subtitleTracks: [],
    mediaVersions: [
      { mediaIndex: 0, partIndex: 0, summary: '1080p', videoCodec: 'h264', container: 'mp4', width: 1920, height: 1080, bitrate: 8000, videoDynamicRange: 'SDR' },
      { mediaIndex: 1, partIndex: 0, summary: '720p', videoCodec: 'h264', container: 'mp4', width: 1280, height: 720, bitrate: 4000, videoDynamicRange: 'SDR' }
    ], markers: [], chapters: []
  };
  var h = createHarness({
    playbackValue: playbackValue,
    detail: {
      preferenceSnapshot: function () { return { override: { versionSignature: { videoCodec: 'hevc', container: 'mkv', width: 3840, height: 2160, bitrate: 20000, hdr: 1 } } }; },
      setPlaybackVersion: function (mediaIndex, partIndex) { saved.push([mediaIndex, partIndex]); }
    },
    VersionSelection: VersionSelection
  });
  h.captured.controlsOptions.changeVersion(1);
  assert.deepStrictEqual(saved[0], [0, 0], 'a missing preferred version must cycle from Automatic fallback to the first physical version');
}());

(function playerAutomaticChoicesClearSeasonAudioAndVersionOverrides() {
  var stored = {};
  var storage = {
    getItem: function (key) { return stored[key] || null; },
    setItem: function (key, value) { stored[key] = value; },
    removeItem: function (key) { delete stored[key]; }
  };
  var detail = { type: 'episode', ratingKey: 'episode-auto', parentRatingKey: 'season-auto' };
  var identity = MediaPreferences.identity('server-a', 'profile-a');
  var playbackValue = {
    ratingKey: detail.ratingKey, requestedPlaybackMode: 'auto',
    options: { audioStreamID: 'a2', subtitleStreamID: '', subtitleSize: 100, mediaIndex: 1, partIndex: 0, videoQuality: 'original', playbackMode: 'auto' },
    audioTracks: [{ id: 'a1', languageTag: 'en' }, { id: 'a2', languageTag: 'it' }], subtitleTracks: [],
    mediaVersions: [
      { mediaIndex: 0, partIndex: 0, summary: 'Automatic', videoCodec: 'h264', container: 'mp4', width: 1920, height: 1080, bitrate: 8000, videoDynamicRange: 'SDR' },
      { mediaIndex: 1, partIndex: 0, summary: 'High', videoCodec: 'hevc', container: 'mkv', width: 3840, height: 2160, bitrate: 20000, videoDynamicRange: 'HDR10' }
    ], markers: [], chapters: []
  };
  MediaPreferences.updateSelection(storage, identity, detail, { audioTrack: MediaPreferences.trackPreference(playbackValue.audioTracks[1]), versionSignature: { videoCodec: 'hevc', container: 'mkv', width: 3840, height: 2160, bitrate: 20000, hdr: 1 } });
  var h = createHarness({
    storage: storage,
    playbackValue: playbackValue,
    data: { activeServer: function () { return { machineIdentifier: 'server-a' }; } },
    detail: {
      snapshot: function () { return { currentDetail: detail, selectedItem: detail }; },
      preferenceSnapshot: function () { return { override: MediaPreferences.effectiveSelection(MediaPreferences.loadScopes(storage, identity, detail), detail) }; },
      resolvePlaybackTracks: function () { return { audioStreamID: 'a1' }; },
      setTrackPreference: function (kind, track) { if (kind === 'audio') { MediaPreferences.updateSelection(storage, identity, detail, { audioTrack: MediaPreferences.trackPreference(track) }); } },
      setPlaybackVersion: function (mediaIndex, _partIndex) { MediaPreferences.updateSelection(storage, identity, detail, { versionSignature: mediaIndex === null ? null : MediaPreferences.versionSignature(playbackValue.mediaVersions[mediaIndex]), legacyVersion: null }); }
    }
  });

  h.captured.controlsOptions.changeTrack('audio', '__automatic__');
  assert.strictEqual(MediaPreferences.loadScopes(storage, identity, detail).season.audioTrack, undefined, 'the Player Automatic audio choice must remove only the season audio override');
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'change-track' && entry[1] === 'audio' && entry[2] === 'a1'; }), 'Automatic audio must immediately resolve through the shared resolver');

  h.captured.controlsOptions.changeVersion('auto');
  assert.strictEqual(MediaPreferences.loadScopes(storage, identity, detail).season, null, 'the Player Automatic version choice must remove the season version override');
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'change-version' && entry[1] && entry[1].mediaIndex === 0; }), 'Automatic version must immediately select the automatic candidate without persisting a physical index');
}());


(function subtitlesOffDoesNotBorrowAnotherTrackPresentationProfile() {
  var stored = {};
  var storage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(stored, key) ? stored[key] : null; },
    setItem: function (key, value) { stored[key] = String(value); },
    removeItem: function (key) { delete stored[key]; }
  };
  var detail = { type: 'episode', ratingKey: 'off-profile-episode', parentRatingKey: 'off-profile-season' };
  var track = { id: 'it-srt', languageTag: 'it', codec: 'srt', format: 'srt', external: true, title: 'Italiano', forced: false };
  var playbackValue = {
    ratingKey: detail.ratingKey, requestedPlaybackMode: 'auto',
    options: { audioStreamID: '', subtitleStreamID: '', subtitleSize: 100, mediaIndex: 0, partIndex: 0, videoQuality: 'original', playbackMode: 'auto' },
    audioTracks: [], subtitleTracks: [track], mediaVersions: [], markers: [], chapters: []
  };
  SubtitleSeriesOffset.saveProfile(storage, 'server-a', detail, 'media', track, { subtitleSize: 150, offsetMs: 350 });
  var h = createHarness({
    storage: storage,
    playbackValue: playbackValue,
    data: { activeServer: function () { return { machineIdentifier: 'server-a' }; } },
    detail: { snapshot: function () { return { currentDetail: detail, selectedItem: detail }; } },
    settings: {
      settings: function () { return { subtitleSize: 100, subtitleBackground: 'off', subtitleEdge: 'shadow', subtitleRenderingSrt: false, subtitleRenderingAss: false }; }
    }
  });
  var loaded = h.captured.subtitleEditorOptions.presentation.load(playbackValue);
  assert.strictEqual(loaded.scope, 'global', 'with subtitles Off, a track-specific media presentation must stay inactive');
  assert.strictEqual(loaded.effective.subtitleSize, 100, 'with no active subtitle track, the editor must start from global presentation instead of another track profile');
  assert.strictEqual(loaded.effective.offsetMs, 0, 'an inactive track offset must not leak into the Off state');
}());

console.log('Player feature settings checks passed');
