'use strict';

var assert = require('assert');
var PlayerSubtitleEditorController = require('../app/coordinator/player-subtitle-editor-controller');
var SubtitleSync = require('../app/subtitle-sync');
var SubtitleStyleDialog = require('../app/subtitle-style-dialog');

function control(name) {
  return {
    name: name,
    getAttribute: function (key) { return key === 'data-subtitle-editor' ? name : ''; },
    focus: function () {}
  };
}

function createHarness(overrides) {
  var values = overrides || {};
  var controls = (values.controlNames || ['track', 'size', 'background', 'edge', 'render-srt', 'render-ass', 'offset', 'loop', 'timeline', 'reset', 'cancel', 'apply-season', 'apply']).map(control);
  var viewCalls = [];
  var playbackCalls = [];
  var settingsCalls = [];
  var presentationCalls = [];
  var choiceCalls = [];
  var confirmationCalls = [];
  var settings = values.settingsValue || {
    subtitleRenderingSrt: false,
    subtitleRenderingAss: false,
    subtitleBackground: 'off',
    subtitleEdge: 'shadow',
    subtitlePosition: 7,
    subtitleSize: 100
  };
  var playbackValue = values.playbackValue || {
    requestedPlaybackMode: 'auto',
    options: { subtitleStreamID: '', subtitleSize: 100, playbackMode: 'auto' },
    subtitleTracks: []
  };
  var editorState = values.editorState || {
    open: false,
    applying: false,
    selectedStreamID: playbackValue.options.subtitleStreamID || '',
    subtitleSize: playbackValue.options.subtitleSize || 100,
    offsetMs: 0,
    loop: false,
    status: '',
    bounds: { start: 0, end: 0 }
  };
  var snapshot = values.snapshot || function () {
    return {
      paused: false,
      positionSeconds: 12,
      durationSeconds: 60,
      playback: playbackValue,
      subtitleEditor: editorState
    };
  };
  var view = {
    controls: function () { return controls; },
    render: function (model) { viewCalls.push(['render', model]); },
    setOpen: function (open) { viewCalls.push(['set-open', open]); },
    renderOverlay: function () { viewCalls.push(['overlay'].concat(Array.prototype.slice.call(arguments))); },
    hideOverlay: function () { viewCalls.push(['hide-overlay']); }
  };
  var controller = PlayerSubtitleEditorController.create({
    platform: { document: {} },
    modules: {
      SubtitleSync: SubtitleSync,
      SubtitleStyleDialog: SubtitleStyleDialog,
      SubtitleEditorView: { create: function () { return view; } },
      Settings: {
        SUBTITLE_SIZES: [75, 100, 125, 150],
        SUBTITLE_BACKGROUNDS: ['off', 'low', 'medium'],
        SUBTITLE_EDGES: ['shadow', 'outline', 'both']
      },
      MediaInfo: {
        selectedTrack: function (tracks, id) {
          var index;
          for (index = 0; index < (tracks || []).length; index += 1) {
            if (String(tracks[index].id || '') === String(id || '')) { return tracks[index]; }
          }
          return null;
        }
      }
    },
    playback: {
      snapshot: snapshot,
      availability: function (streamId) {
        if (values.availability) { return values.availability(streamId); }
        return { enabled: true, reason: '' };
      },
      open: function (options) {
        playbackCalls.push(['open', options || null]);
        if (values.playbackOpenResult && values.playbackOpenResult(options || null, editorState) === false) { return false; }
        if (!options) { editorState.open = true; }
        else if (options.action === 'set-track') { editorState.selectedStreamID = String(options.streamId || ''); }
        else if (options.action === 'set-size') { editorState.subtitleSize = Number(options.size); }
        else if (options.action === 'adjust-offset') { editorState.offsetMs += Number(options.delta || 0); }
        return true;
      },
      apply: function (options, callback) {
        playbackCalls.push(['apply', options || null]);
        editorState.open = false;
        if (values.applyError) { callback(values.applyError); }
        else { callback(null); }
        return true;
      },
      cancel: function (callback) {
        playbackCalls.push(['cancel']);
        editorState.open = false;
        callback(values.cancelError || null);
        return true;
      },
      toggle: function () { playbackCalls.push(['toggle']); return true; }
    },
    settings: {
      current: function () { return settings; },
      previewStyle: function (style) { settingsCalls.push(['preview-style', style]); },
      commitStyle: function (style) { settingsCalls.push(['commit-style', style]); },
      restoreStyle: function (style) { settingsCalls.push(['restore-style', style]); },
      commitRendering: function (rendering) {
        settings.subtitleRenderingSrt = rendering.srt === true;
        settings.subtitleRenderingAss = rendering.ass === true;
        settingsCalls.push(['commit-rendering', { srt: settings.subtitleRenderingSrt, ass: settings.subtitleRenderingAss }]);
        return { srt: settings.subtitleRenderingSrt, ass: settings.subtitleRenderingAss };
      }
    },
    presentation: {
      t: function (key) { return key; },
      setText: function () {},
      trackLabel: function (tracks, id, offLabel) {
        var track = tracks.filter(function (candidate) { return String(candidate.id || '') === String(id || ''); })[0];
        return track ? (track.label || track.id) : offLabel;
      },
      subtitleSizes: function () { return [75, 100, 125, 150]; },
      formatTime: function (value) { return String(value); },
      pointerActive: function () { return false; },
      seasonAvailable: function () { return values.seasonAvailable === true; },
      load: function () {
        if (values.presentationLoad) { return values.presentationLoad(); }
        return {
          effective: {
            subtitleSize: settings.subtitleSize,
            subtitleBackground: settings.subtitleBackground,
            subtitleEdge: settings.subtitleEdge,
            renderSrt: settings.subtitleRenderingSrt === true,
            renderAss: settings.subtitleRenderingAss === true,
            offsetMs: editorState.offsetMs
          },
          parent: {}, layers: { media: null, season: null }
        };
      },
      save: function (scope, state) { presentationCalls.push(['save', scope, state]); return values.saveResult === undefined ? true : values.saveResult; },
      reset: function (scope) { presentationCalls.push(['reset', scope]); return values.resetProjection ? values.resetProjection(scope) : null; },
      finish: function () { presentationCalls.push(['finish']); },
      reportError: function (error) { presentationCalls.push(['error', error]); },
      setPanelOpen: function (open) { presentationCalls.push(['panel', open]); },
      openChoice: function (title, choices, selected, choose, close) {
        choiceCalls.push({ title: title, choices: choices, selected: selected, choose: choose, close: close });
      },
      confirmRendering: function (name, enabled, confirm, close) {
        confirmationCalls.push({ name: name, enabled: enabled, confirm: confirm, close: close });
      }
    }
  });
  return {
    controller: controller,
    controls: controls,
    playbackCalls: playbackCalls,
    settingsCalls: settingsCalls,
    presentationCalls: presentationCalls,
    choiceCalls: choiceCalls,
    confirmationCalls: confirmationCalls,
    viewCalls: viewCalls,
    editorState: editorState,
    playbackValue: playbackValue,
    settingsValue: settings
  };
}

(function trackChoiceFilteringUsesPlaybackAuthority() {
  var h = createHarness({
    playbackValue: {
      requestedPlaybackMode: 'auto',
      options: { subtitleStreamID: '', subtitleSize: 100, playbackMode: 'auto' },
      subtitleTracks: [
        { id: 'ass', codec: 'ass', format: 'ass', external: false, label: 'ASS' },
        { id: 'srt', codec: 'srt', format: 'srt', external: false, label: 'SRT' }
      ]
    },
    availability: function () { return { enabled: true, reason: '' }; }
  });
  assert.strictEqual(h.controller.open(), true);
  h.controller.handleKey({ keyCode: 13 }, '');
  assert.strictEqual(h.choiceCalls.length, 1);
  assert.deepStrictEqual(h.choiceCalls[0].choices.map(function (choice) { return choice.value; }), ['__inherit__', '', 'ass', 'srt'],
    'track dialog must include embedded ASS together with text tracks accepted by Advanced Subtitle Settings');
  assert.strictEqual(h.choiceCalls[0].choices[0].label, 'player.automatic',
    'advanced subtitle track selection must label inherited resolver behavior as Automatic');
}());





(function gridNavigationMovesFocusWithoutMutatingValues() {
  var h = createHarness({ seasonAvailable: true });
  h.controller.open();
  h.controller.handleKey({ keyCode: 39 }, 'right');
  assert.strictEqual(h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1].index, 1,
    'Right from Track must move focus to Size instead of cycling the track');
  assert.strictEqual(h.playbackCalls.filter(function (entry) { return entry[0] === 'open' && entry[1] && entry[1].action === 'set-track'; }).length, 0,
    'moving focus horizontally must not change the selected subtitle track');
  h.controller.handleKey({ keyCode: 40 }, 'down');
  assert.strictEqual(h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1].index, 3,
    'Down from Size must move to Edge in the second column');
  h.controller.handleKey({ keyCode: 40 }, 'down');
  assert.strictEqual(h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1].index, 5,
    'Down must preserve the logical column through the renderer row');
  h.controller.handleKey({ keyCode: 37 }, 'left');
  assert.strictEqual(h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1].index, 4,
    'Left on renderer controls must move focus instead of toggling the value');
  assert.strictEqual(h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1].renderSrt, false,
    'moving across renderer controls must not alter their state');
}());

(function okActivatesChoicesAndToggles() {
  var h = createHarness();
  h.controller.open();
  h.controller.handleKey({ keyCode: 13 }, '');
  assert.strictEqual(h.choiceCalls.length, 1, 'OK on Track must open the existing choice dialog');
  h.controller.pointerFocus(h.controls[4]);
  h.controller.handleKey({ keyCode: 13 }, '');
  assert.strictEqual(h.confirmationCalls.length, 1, 'OK on the SRT renderer must open the global confirmation');
  assert.strictEqual(h.confirmationCalls[0].enabled, true);
  h.confirmationCalls[0].confirm();
  assert.strictEqual(h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1].renderSrt, true,
    'confirming the global SRT renderer change must update the editor value');
}());

(function offsetRequiresExplicitEditModeAndVerticalMovementCommitsDraftFocus() {
  var h = createHarness();
  var lastRender;
  h.controller.open();
  h.controller.pointerFocus(h.controls[6]);
  h.controller.handleKey({ keyCode: 39 }, 'right');
  assert.strictEqual(h.editorState.offsetMs, 0, 'Right on a focused Offset control must not edit before OK');
  assert.strictEqual(h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1].index, 7,
    'Right on Offset outside edit mode must navigate to Loop');
  h.controller.pointerFocus(h.controls[6]);
  h.controller.handleKey({ keyCode: 13 }, '');
  assert.strictEqual(h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1].editing, 'offset',
    'OK on Offset must enter explicit edit mode');
  h.controller.handleKey({ keyCode: 39 }, 'right');
  assert.strictEqual(h.editorState.offsetMs, 100, 'Right must adjust offset only after entering edit mode');
  h.controller.handleKey({ keyCode: 40 }, 'down');
  lastRender = h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1];
  assert.strictEqual(h.editorState.offsetMs, 100, 'moving vertically out of Offset edit mode must keep the current draft value');
  assert.strictEqual(lastRender.editing, '', 'Down while editing Offset must leave edit mode');
  assert.strictEqual(lastRender.index, 8, 'Down while editing Offset must move focus to Timeline');
  h.controller.handleKey({ keyCode: 38 }, 'up');
  assert.strictEqual(h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1].index, 6,
    'Up from Timeline must return to Offset without re-entering edit mode');
  h.controller.handleKey({ keyCode: 39 }, 'right');
  assert.strictEqual(h.editorState.offsetMs, 100, 'Offset must require OK again before another horizontal edit');
}());

(function timelineSeeksDirectlyWithoutExplicitEditMode() {
  var h = createHarness();
  var seekCalls;
  h.controller.open();
  h.controller.pointerFocus(h.controls[8]);
  h.controller.handleKey({ keyCode: 37 }, 'left');
  seekCalls = h.playbackCalls.filter(function (entry) { return entry[0] === 'open' && entry[1] && entry[1].action === 'seek'; });
  assert.strictEqual(seekCalls.length, 1, 'Left on a focused Timeline must seek immediately without OK');
  assert.strictEqual(seekCalls[0][1].delta, -10, 'Left on Timeline must seek backward by the established preview step');
  h.controller.handleKey({ keyCode: 39 }, 'right');
  seekCalls = h.playbackCalls.filter(function (entry) { return entry[0] === 'open' && entry[1] && entry[1].action === 'seek'; });
  assert.strictEqual(seekCalls.length, 2, 'Right on a focused Timeline must seek immediately without OK');
  assert.strictEqual(seekCalls[1][1].delta, 10, 'Right on Timeline must seek forward by the established preview step');
  assert.strictEqual(h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1].index, 8,
    'horizontal Timeline seeking must keep focus on Timeline');
  assert.strictEqual(h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1].editing, '',
    'Timeline must not require or enter an explicit edit mode');
}());

(function applyCommitsPresentationDraftsAndMediaScope() {
  var editorState = {
    open: false,
    applying: false,
    selectedStreamID: 'ass',
    subtitleSize: 100,
    offsetMs: 0,
    loop: false,
    status: '',
    previewMode: 'ass',
    bounds: { start: 0, end: 0 }
  };
  var h = createHarness({
    playbackValue: {
      requestedPlaybackMode: 'auto',
      options: { subtitleStreamID: 'ass', subtitleSize: 100, playbackMode: 'auto' },
      subtitleTracks: [{ id: 'ass', codec: 'ass', format: 'ass', external: false, label: 'ASS' }]
    },
    editorState: editorState
  });
  h.controller.open();
  h.controller.pointerFocus(h.controls[12]);
  h.controller.handleKey({ keyCode: 13 }, '');
  assert.strictEqual(h.playbackCalls.filter(function (entry) { return entry[0] === 'apply'; }).length, 1);
  assert.strictEqual(h.presentationCalls.filter(function (entry) { return entry[0] === 'save'; })[0][1], 'media');
  assert.strictEqual(h.settingsCalls.filter(function (entry) { return entry[0] === 'commit-rendering'; }).length, 0,
    'Apply must never commit renderer preferences globally');
  assert.deepStrictEqual(h.playbackCalls.filter(function (entry) { return entry[0] === 'apply'; })[0][1].rendering, { srt: false, ass: false },
    'Apply must pass the current global renderer state to Playback');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(h.presentationCalls.filter(function (entry) { return entry[0] === 'save'; })[0][2], 'rendering'), false,
    'Apply must never persist renderer flags in media or season presentation scope');
  assert.strictEqual(h.presentationCalls.filter(function (entry) { return entry[0] === 'finish'; }).length, 1);
}());


(function failedPresentationSaveKeepsEditorDraftOpenAndReportsError() {
  var h = createHarness({ saveResult: false });
  h.controller.open();
  h.controller.pointerFocus(h.controls[12]);
  h.controller.handleKey({ keyCode: 13 }, '');
  assert.strictEqual(h.presentationCalls.filter(function (entry) { return entry[0] === 'save'; }).length, 1,
    'Apply must attempt scoped persistence once');
  assert.strictEqual(h.presentationCalls.filter(function (entry) { return entry[0] === 'finish'; }).length, 0,
    'a failed scoped save must not finish and discard the editor draft');
  assert.strictEqual(h.presentationCalls.filter(function (entry) { return entry[0] === 'error'; }).length, 1,
    'a failed scoped save must be surfaced through the existing error owner');
}());

(function serverFallbackDoesNotPersistAutomaticAssRendering() {
  var editorState = {
    open: false,
    applying: false,
    selectedStreamID: 'ass',
    subtitleSize: 100,
    offsetMs: 0,
    loop: false,
    status: '',
    previewMode: 'server',
    bounds: { start: 0, end: 0 }
  };
  var h = createHarness({
    playbackValue: {
      requestedPlaybackMode: 'auto',
      options: { subtitleStreamID: 'ass', subtitleSize: 100, playbackMode: 'auto' },
      subtitleTracks: [{ id: 'ass', codec: 'ass', format: 'ass', external: true, label: 'External ASS' }]
    },
    editorState: editorState
  });
  h.controller.open();
  h.controller.pointerFocus(h.controls[12]);
  h.controller.handleKey({ keyCode: 13 }, '');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(h.presentationCalls.filter(function (entry) { return entry[0] === 'save'; })[0][2], 'rendering'), false,
    'Apply after Plex fallback must not persist global renderer flags in scoped presentation state');
}());

(function cancelRestoresOriginalStyleWithoutPersistingRendering() {
  var h = createHarness();
  h.controller.open();
  h.controller.pointerFocus(h.controls[10]);
  h.controller.handleKey({ keyCode: 13 }, '');
  assert.strictEqual(h.playbackCalls.filter(function (entry) { return entry[0] === 'cancel'; }).length, 1);
  assert.strictEqual(h.settingsCalls.filter(function (entry) { return entry[0] === 'restore-style'; }).length, 1);
  assert.strictEqual(h.settingsCalls.filter(function (entry) { return entry[0] === 'commit-rendering'; }).length, 0);
}());

(function applySeasonUsesSeasonScopeAndAdvertisesAvailability() {
  var h = createHarness({ seasonAvailable: true });
  h.controller.open();
  assert.strictEqual(h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1].seasonAvailable, true);
  h.controller.pointerFocus(h.controls[11]);
  h.controller.handleKey({ keyCode: 13 }, '');
  assert.strictEqual(h.presentationCalls.filter(function (entry) { return entry[0] === 'save'; })[0][1], 'season');
}());


(function resetMediaIsDraftOnlyUntilApplyAndShowsUnsavedScope() {
  var seasonTrack = { id: 'season-track', languageTag: 'it', codec: 'srt', format: 'srt', external: true, title: 'Dialoghi' };
  var h = createHarness({
    seasonAvailable: true,
    playbackValue: {
      requestedPlaybackMode: 'auto',
      options: { subtitleStreamID: 'media-track', subtitleSize: 150, playbackMode: 'auto' },
      subtitleTracks: [seasonTrack, { id: 'media-track', languageTag: 'en', codec: 'srt', format: 'srt', external: true, title: 'English' }]
    },
    presentationLoad: function () {
      return {
        effective: { subtitleSize: 150, subtitleBackground: 'high', subtitleEdge: 'outline', renderSrt: true, renderAss: false, offsetMs: 300 },
        parent: { subtitleSize: 125, subtitleBackground: 'medium', subtitleEdge: 'shadow', renderSrt: false, renderAss: false, offsetMs: 100 },
        globals: { subtitleSize: 100, subtitleBackground: 'off', subtitleEdge: 'shadow', renderSrt: false, renderAss: false, offsetMs: 0 },
        layers: { media: { subtitleSize: 150, subtitleMode: 'track' }, season: { subtitleSize: 125, subtitleMode: 'track' } },
        scope: 'media', inheritedStreamID: 'season-track'
      };
    },
    resetProjection: function (scope) {
      assert.strictEqual(scope, 'media');
      return {
        effective: { subtitleSize: 125, subtitleBackground: 'medium', subtitleEdge: 'shadow', renderSrt: false, renderAss: false, offsetMs: 100 },
        selectedStreamID: 'season-track', scope: 'season', trackIntent: 'inherit', resetSeason: false
      };
    }
  });
  h.controller.open();
  assert.strictEqual(h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1].status, 'player.subtitleScopeEpisode',
    'opening an episode media override must identify the episode scope');
  h.controller.pointerFocus(h.controls[9]);
  h.controller.handleKey({ keyCode: 13 }, '');
  assert.deepStrictEqual(h.choiceCalls[0].choices.map(function (choice) { return choice.value; }), ['media', 'season', 'cancel'],
    'Reset must offer media, season and cancel for episodic playback');
  h.choiceCalls[0].choose({ value: 'media' });
  assert.strictEqual(h.presentationCalls.filter(function (entry) { return entry[0] === 'save'; }).length, 0,
    'choosing Reset media must not persist before Apply');
  assert.strictEqual(h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1].status, 'player.subtitleScopeUnsaved',
    'a reset draft must be clearly marked as unsaved');
  assert.ok(h.playbackCalls.some(function (entry) { return entry[0] === 'open' && entry[1] && entry[1].action === 'set-track' && entry[1].streamId === 'season-track'; }),
    'resetting media must preview the inherited season track immediately');
  h.controller.pointerFocus(h.controls[12]);
  h.controller.handleKey({ keyCode: 13 }, '');
  var saved = h.presentationCalls.filter(function (entry) { return entry[0] === 'save'; })[0];
  assert.strictEqual(saved[2].trackIntent, 'inherit', 'Apply after Reset media must remove the media track intent instead of pinning the inherited stream');
}());

(function resetDefersLocalOnlySizeUntilTheNewTrackActuallyOwnsPixels() {
  var editorState = {
    open: false,
    applying: false,
    selectedStreamID: 'ass',
    subtitleSize: 100,
    offsetMs: 0,
    loop: false,
    status: '',
    previewMode: 'server',
    previewLoading: false,
    previewError: false,
    rendererType: null,
    capabilities: {
      track: true, size: false, background: false, edge: false,
      renderSrt: true, renderAss: true, offset: true, loop: true, timeline: true
    },
    bounds: { start: 5, end: 10 }
  };
  var h = createHarness({
    playbackValue: {
      requestedPlaybackMode: 'auto',
      options: { subtitleStreamID: 'ass', subtitleSize: 100, playbackMode: 'auto' },
      subtitleTracks: [
        { id: 'ass', codec: 'ass', external: false, label: 'Embedded ASS' },
        { id: 'srt', codec: 'srt', external: true, key: '/subtitles/reset.srt', label: 'External SRT' }
      ]
    },
    editorState: editorState,
    playbackOpenResult: function (options, state) {
      if (options && options.action === 'set-size' && state.capabilities && state.capabilities.size === false) { return false; }
      return true;
    },
    resetProjection: function () {
      return {
        effective: { subtitleSize: 150, subtitleBackground: 'medium', subtitleEdge: 'outline', offsetMs: 200 },
        selectedStreamID: 'srt', scope: 'global', trackIntent: 'inherit', resetSeason: false
      };
    }
  });
  h.controller.open();
  h.controller.pointerFocus(h.controls[9]);
  h.controller.handleKey({ keyCode: 13 }, '');
  h.choiceCalls[0].choose({ value: 'media' });
  assert.strictEqual(editorState.selectedStreamID, 'srt');
  assert.strictEqual(editorState.subtitleSize, 100,
    'reset must not force a local-only size through while the newly selected track is still server-owned/loading');
  editorState.previewMode = 'overlay';
  editorState.previewLoading = false;
  editorState.previewError = false;
  editorState.capabilities = {
    track: true, size: true, background: true, edge: true,
    renderSrt: true, renderAss: true, offset: true, loop: true, timeline: true
  };
  h.controller.update(editorState);
  assert.strictEqual(editorState.subtitleSize, 150,
    'the pending reset size must be applied once the new local text renderer owns the pixels');
  assert.ok(h.playbackCalls.some(function (entry) {
    return entry[0] === 'open' && entry[1] && entry[1].action === 'set-size' && entry[1].size === 150;
  }), 'the deferred reset must use the normal capability-gated playback action');
}());

(function movieMediaScopeUsesGenericContentCopy() {
  var h = createHarness({
    seasonAvailable: false,
    presentationLoad: function () {
      return {
        effective: { subtitleSize: 125, subtitleBackground: 'off', subtitleEdge: 'shadow', renderSrt: false, renderAss: false, offsetMs: 0 },
        parent: { subtitleSize: 100 }, globals: { subtitleSize: 100 },
        layers: { media: { subtitleSize: 125 }, season: null }, scope: 'media', inheritedStreamID: ''
      };
    }
  });
  h.controller.open();
  assert.strictEqual(h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1].status, 'player.subtitleScopeMedia',
    'non-episodic media overrides must use generic media scope copy');
}());

(function resetSeasonStaysDraftOnlyAndMarksSeasonDeletionForApply() {
  var h = createHarness({
    seasonAvailable: true,
    presentationLoad: function () {
      return {
        effective: { subtitleSize: 125, subtitleBackground: 'medium', subtitleEdge: 'shadow', renderSrt: false, renderAss: false, offsetMs: 0 },
        parent: { subtitleSize: 125 }, globals: { subtitleSize: 100 },
        layers: { media: null, season: { subtitleSize: 125 } }, scope: 'season', inheritedStreamID: ''
      };
    },
    resetProjection: function (scope) {
      assert.strictEqual(scope, 'season');
      return { effective: { subtitleSize: 100, subtitleBackground: 'off', subtitleEdge: 'shadow', renderSrt: false, renderAss: false, offsetMs: 0 }, selectedStreamID: '', scope: 'global', trackIntent: 'inherit', resetSeason: true };
    }
  });
  h.controller.open();
  h.controller.pointerFocus(h.controls[9]);
  h.controller.handleKey({ keyCode: 13 }, '');
  h.choiceCalls[0].choose({ value: 'season' });
  assert.strictEqual(h.presentationCalls.filter(function (entry) { return entry[0] === 'save'; }).length, 0,
    'Reset season must remain a draft until Apply');
  h.controller.pointerFocus(h.controls[12]);
  h.controller.handleKey({ keyCode: 13 }, '');
  assert.strictEqual(h.presentationCalls.filter(function (entry) { return entry[0] === 'save'; })[0][2].resetSeason, true,
    'Apply must carry the pending season deletion to the persistence owner');
}());

(function trackDefaultChoiceMeansInheritInsteadOfCurrentConcreteStream() {
  var h = createHarness({
    seasonAvailable: true,
    playbackValue: {
      requestedPlaybackMode: 'auto',
      options: { subtitleStreamID: 'season-track', subtitleSize: 100, playbackMode: 'auto' },
      subtitleTracks: [{ id: 'season-track', languageTag: 'it', codec: 'srt', format: 'srt', external: true, title: 'Dialoghi', label: 'Italiano' }]
    },
    presentationLoad: function () {
      return {
        effective: { subtitleSize: 100, subtitleBackground: 'off', subtitleEdge: 'shadow', renderSrt: false, renderAss: false, offsetMs: 0, subtitleMode: 'track' },
        parent: { subtitleMode: 'track' }, globals: { subtitleSize: 100 },
        layers: { media: null, season: { subtitleMode: 'track' } }, scope: 'season', inheritedStreamID: 'season-track'
      };
    }
  });
  h.controller.open();
  h.controller.handleKey({ keyCode: 13 }, '');
  assert.strictEqual(h.choiceCalls[0].choices[0].value, '__inherit__', 'advanced track choices must expose Automatic before Off and concrete streams');
  assert.strictEqual(h.choiceCalls[0].selected, '__inherit__', 'an inherited season track must render as Automatic at media scope');
  h.choiceCalls[0].choose({ value: '__inherit__' });
  h.controller.pointerFocus(h.controls[12]);
  h.controller.handleKey({ keyCode: 13 }, '');
  assert.strictEqual(h.presentationCalls.filter(function (entry) { return entry[0] === 'save'; })[0][2].trackIntent, 'inherit',
    'Automatic must persist inheritance, not the currently resolved stream id');
}());

(function rendererControlsAreGlobalAndRequireConfirmation() {
  var h = createHarness();
  h.controller.open();
  h.controller.pointerFocus(h.controls[4]);
  h.controller.handleKey({ keyCode: 13 }, '');
  assert.strictEqual(h.confirmationCalls.length, 1, 'enabling SRT/WebVTT rendering from the advanced editor must require a global confirmation');
  assert.strictEqual(h.confirmationCalls[0].name, 'srt');
  assert.strictEqual(h.confirmationCalls[0].enabled, true);
  assert.strictEqual(h.settingsCalls.filter(function (entry) { return entry[0] === 'commit-rendering'; }).length, 0,
    'opening the confirmation must not mutate global settings');
  h.confirmationCalls[0].confirm();
  assert.deepStrictEqual(h.settingsCalls.filter(function (entry) { return entry[0] === 'commit-rendering'; })[0][1], { srt: true, ass: false },
    'confirming SRT/WebVTT must persist the new global rendering state immediately');
  assert.ok(h.playbackCalls.some(function (entry) { return entry[0] === 'open' && entry[1] && entry[1].action === 'set-rendering'; }),
    'confirming a global renderer change must refresh the active editor preview');
  assert.strictEqual(h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1].renderSrt, true,
    'the editor must immediately reflect the confirmed global SRT/WebVTT state');
}());

(function rendererConfirmationNoLeavesGlobalStateUntouched() {
  var h = createHarness();
  h.controller.open();
  h.controller.pointerFocus(h.controls[5]);
  h.controller.handleKey({ keyCode: 13 }, '');
  assert.strictEqual(h.confirmationCalls.length, 1, 'enabling ASS rendering must require confirmation');
  assert.strictEqual(h.confirmationCalls[0].name, 'ass');
  assert.strictEqual(h.confirmationCalls[0].enabled, true);
  if (h.confirmationCalls[0].close) { h.confirmationCalls[0].close(); }
  assert.strictEqual(h.settingsCalls.filter(function (entry) { return entry[0] === 'commit-rendering'; }).length, 0,
    'declining the global ASS change must leave settings untouched');
  assert.strictEqual(h.settingsValue.subtitleRenderingAss, false);
}());

(function disablingGlobalRenderersUsesTheSameConfirmationContract() {
  var h = createHarness({
    settingsValue: {
      subtitleRenderingSrt: true,
      subtitleRenderingAss: true,
      subtitleBackground: 'off',
      subtitleEdge: 'shadow',
      subtitlePosition: 7,
      subtitleSize: 100
    }
  });
  h.controller.open();
  h.controller.pointerFocus(h.controls[5]);
  h.controller.handleKey({ keyCode: 13 }, '');
  assert.strictEqual(h.confirmationCalls[0].name, 'ass');
  assert.strictEqual(h.confirmationCalls[0].enabled, false, 'disabling ASS must explicitly confirm the global disable');
  h.confirmationCalls[0].confirm();
  assert.strictEqual(h.settingsValue.subtitleRenderingAss, false);
  h.controller.pointerFocus(h.controls[4]);
  h.controller.handleKey({ keyCode: 13 }, '');
  assert.strictEqual(h.confirmationCalls[1].name, 'srt');
  assert.strictEqual(h.confirmationCalls[1].enabled, false, 'disabling SRT/WebVTT must explicitly confirm the global disable');
}());

(function assTrackDoesNotAutoEnableGlobalRenderingAndScopedSaveOmitsRendererFlags() {
  var h = createHarness({
    playbackValue: {
      requestedPlaybackMode: 'auto',
      options: { subtitleStreamID: 'ass', subtitleSize: 100, playbackMode: 'auto' },
      subtitleTracks: [{ id: 'ass', codec: 'ass', format: 'ass', external: true, label: 'External ASS' }]
    }
  });
  h.controller.open();
  assert.strictEqual(h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1].renderAss, false,
    'opening an ASS track must respect the disabled global ASS renderer instead of auto-enabling it');
  h.controller.pointerFocus(h.controls[12]);
  h.controller.handleKey({ keyCode: 13 }, '');
  var saved = h.presentationCalls.filter(function (entry) { return entry[0] === 'save'; })[0][2];
  assert.strictEqual(Object.prototype.hasOwnProperty.call(saved, 'rendering'), false,
    'episode/media subtitle presentation persistence must not receive global renderer flags');
}());

(function embeddedAssCapabilitiesDisableOnlyIrrelevantAppearanceControls() {
  var editorState = {
    open: true,
    applying: false,
    selectedStreamID: 'ass',
    subtitleSize: 125,
    offsetMs: 300,
    loop: false,
    status: '',
    previewMode: 'ass',
    previewLoading: false,
    previewError: false,
    rendererType: 'ass',
    bounds: { start: 5, end: 10 }
  };
  var h = createHarness({
    seasonAvailable: true,
    settingsValue: {
      subtitleRenderingSrt: false,
      subtitleRenderingAss: true,
      subtitleBackground: 'medium',
      subtitleEdge: 'outline',
      subtitlePosition: 7,
      subtitleSize: 125
    },
    playbackValue: {
      requestedPlaybackMode: 'auto',
      options: { subtitleStreamID: 'ass', subtitleSize: 125, playbackMode: 'auto' },
      subtitleTracks: [{ id: 'ass', codec: 'ass', format: 'ass', external: false, location: 'embedded', label: 'Embedded ASS' }]
    },
    editorState: editorState
  });
  h.controller.render();
  var model = h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1];
  assert.strictEqual(model.capabilities.size, true, 'local embedded ASS must keep size available');
  assert.strictEqual(model.capabilities.background, false, 'ASS background must remain owned by libass');
  assert.strictEqual(model.capabilities.edge, false, 'ASS edge/outline must remain owned by libass');
  assert.strictEqual(model.capabilities['render-srt'], false, 'SRT renderer toggle must be disabled when the media has no text tracks');
  assert.strictEqual(model.capabilities['render-ass'], true, 'ASS renderer toggle must remain relevant for embedded ASS media');
  assert.strictEqual(model.capabilities.offset, true, 'embedded ASS timing must remain editable');
  assert.strictEqual(h.controller.pointerFocus(h.controls[2]), false,
    'pointer focus must reject a disabled ASS background row');
  assert.strictEqual(h.choiceCalls.length, 0, 'disabled ASS appearance rows must not open a choice dialog');
  h.controller.pointerFocus(h.controls[1]);
  h.controller.handleKey({ keyCode: 40 }, 'down');
  model = h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1];
  assert.strictEqual(model.index, 5,
    'D-pad navigation must skip the fully disabled appearance row and land on the nearest enabled ASS control');
  h.controller.pointerFocus(h.controls[12]);
  h.controller.handleKey({ keyCode: 13 }, '');
  var saved = h.presentationCalls.filter(function (entry) { return entry[0] === 'save'; })[0][2];
  assert.strictEqual(saved.capabilities.background, false);
  assert.strictEqual(saved.capabilities.edge, false);
  assert.strictEqual(saved.capabilities.size, true);
  assert.strictEqual(saved.capabilities.offset, true);
}());

(function capabilitiesRefreshWhenSwitchingBetweenEmbeddedAssAndLocalSrt() {
  var editorState = {
    open: true,
    applying: false,
    selectedStreamID: 'ass',
    subtitleSize: 100,
    offsetMs: 0,
    loop: false,
    status: '',
    previewMode: 'ass',
    previewLoading: false,
    previewError: false,
    rendererType: 'ass',
    bounds: { start: 5, end: 10 }
  };
  var h = createHarness({
    playbackValue: {
      requestedPlaybackMode: 'auto',
      options: { subtitleStreamID: 'ass', subtitleSize: 100, playbackMode: 'auto' },
      subtitleTracks: [
        { id: 'ass', codec: 'ass', external: false, location: 'embedded', label: 'Embedded ASS' },
        { id: 'srt', codec: 'srt', external: false, location: 'embedded', label: 'Embedded SRT' }
      ]
    },
    editorState: editorState
  });
  h.controller.render();
  var model = h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1];
  assert.strictEqual(model.capabilities.background, false);
  editorState.selectedStreamID = 'srt';
  editorState.previewMode = 'overlay';
  editorState.previewLoading = false;
  editorState.previewError = false;
  editorState.rendererType = null;
  h.controller.update(editorState);
  model = h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1];
  assert.strictEqual(model.capabilities.background, true, 'local SRT must re-enable background immediately');
  assert.strictEqual(model.capabilities.edge, true, 'local SRT must re-enable edge immediately');
  editorState.selectedStreamID = 'ass';
  editorState.previewMode = 'ass';
  editorState.previewLoading = false;
  editorState.previewError = false;
  editorState.rendererType = 'ass';
  h.controller.update(editorState);
  model = h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1];
  assert.strictEqual(model.capabilities.background, false, 'switching back to ASS must disable SRT-only style again');
}());

(function forceTranscodeAssKeepsTimingButDisablesLocalPixelControls() {
  var h = createHarness({
    playbackValue: {
      requestedPlaybackMode: 'transcode',
      options: { subtitleStreamID: 'ass', subtitleSize: 100, playbackMode: 'transcode' },
      subtitleTracks: [{ id: 'ass', codec: 'ass', external: false, location: 'embedded', label: 'Embedded ASS' }]
    },
    editorState: {
      open: true, applying: false, selectedStreamID: 'ass', subtitleSize: 100, offsetMs: 0,
      loop: false, status: '', previewMode: 'server', bounds: { start: 5, end: 10 }
    }
  });
  h.controller.render();
  var model = h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1];
  assert.strictEqual(model.capabilities.size, false, 'server-owned ASS must disable local size');
  assert.strictEqual(model.capabilities.background, false);
  assert.strictEqual(model.capabilities.edge, false);
  assert.strictEqual(model.capabilities.offset, true, 'embedded ASS timing remains relevant in Force Transcode');
  assert.strictEqual(h.controller.pointerFocus(h.controls[1]), false, 'disabled server ASS size must reject pointer focus');
}());


(function embeddedAssLoadingAndFailureKeepTimingButDisablePixelControls() {
  var editorState = {
    open: true, applying: false, selectedStreamID: 'ass', subtitleSize: 125, offsetMs: 300,
    loop: false, status: 'loading', previewMode: 'ass', previewLoading: true,
    previewError: false, rendererType: null, bounds: { start: 5, end: 10 }
  };
  var h = createHarness({
    playbackValue: {
      requestedPlaybackMode: 'auto',
      options: { subtitleStreamID: 'ass', subtitleSize: 125, playbackMode: 'auto' },
      subtitleTracks: [{ id: 'ass', codec: 'ass', external: false, label: 'Embedded ASS' }]
    },
    editorState: editorState
  });
  h.controller.render();
  var model = h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1];
  assert.strictEqual(model.capabilities.size, false,
    'ASS size must remain disabled until the local renderer actually owns a loaded preview');
  assert.strictEqual(model.capabilities.offset, true,
    'embedded ASS timing must remain editable while the local preview is loading');
  editorState.previewLoading = false;
  editorState.previewError = true;
  h.controller.update(editorState);
  model = h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1];
  assert.strictEqual(model.capabilities.size, false,
    'a failed local ASS preview must not advertise local pixel-size ownership');
  assert.strictEqual(model.capabilities.offset, true,
    'a failed preview must not hide the persisted embedded ASS timing control');
}());

(function disabledFocusMovesToTheNearestEnabledControlAfterTrackChange() {
  var editorState = {
    open: true, applying: false, selectedStreamID: 'srt', subtitleSize: 100, offsetMs: 0,
    loop: false, status: '', previewMode: 'overlay', previewLoading: false,
    previewError: false, rendererType: null, bounds: { start: 5, end: 10 }
  };
  var h = createHarness({
    playbackValue: {
      requestedPlaybackMode: 'auto',
      options: { subtitleStreamID: 'srt', subtitleSize: 100, playbackMode: 'auto' },
      subtitleTracks: [
        { id: 'srt', codec: 'srt', external: false, label: 'Embedded SRT' },
        { id: 'ass', codec: 'ass', external: false, label: 'Embedded ASS' }
      ]
    },
    editorState: editorState
  });
  h.controller.pointerFocus(h.controls[2]);
  assert.strictEqual(h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1].index, 2,
    'test setup must focus the SRT-only background row');
  editorState.selectedStreamID = 'ass';
  editorState.previewMode = 'ass';
  editorState.previewLoading = false;
  editorState.previewError = false;
  editorState.rendererType = 'ass';
  h.controller.update(editorState);
  var model = h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1];
  assert.strictEqual(model.capabilities.background, false);
  assert.strictEqual(model.index, 1,
    'when a focused SRT-only row becomes disabled, focus must move to the nearest enabled control');
}());

(function editingModeClearsWhenTheEditedControlBecomesDisabled() {
  var editorState = {
    open: true, applying: false, selectedStreamID: 'ass', subtitleSize: 100, offsetMs: 0,
    loop: false, status: '', previewMode: 'ass', previewLoading: false,
    previewError: false, rendererType: 'ass', bounds: { start: 5, end: 10 }
  };
  var h = createHarness({
    playbackValue: {
      requestedPlaybackMode: 'auto',
      options: { subtitleStreamID: 'ass', subtitleSize: 100, playbackMode: 'auto' },
      subtitleTracks: [{ id: 'ass', codec: 'ass', external: false, label: 'Embedded ASS' }]
    },
    editorState: editorState
  });
  h.controller.pointerFocus(h.controls[6]);
  h.controller.handleKey({ keyCode: 13 }, '');
  var model = h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1];
  assert.strictEqual(model.editing, 'offset', 'test setup must enter offset editing mode');
  editorState.selectedStreamID = '';
  editorState.previewMode = 'server';
  editorState.rendererType = null;
  h.controller.update(editorState);
  model = h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1];
  assert.strictEqual(model.capabilities.offset, false, 'Off must disable track-specific timing controls');
  assert.strictEqual(model.editing, '',
    'editing mode must end immediately when a track change disables the edited control');
}());

(function offTrackDisablesTrackSpecificControlsButKeepsAvailableRendererFamilies() {
  var h = createHarness({
    playbackValue: {
      requestedPlaybackMode: 'auto',
      options: { subtitleStreamID: '', subtitleSize: 100, playbackMode: 'auto' },
      subtitleTracks: [
        { id: 'srt', codec: 'srt', external: true, label: 'External SRT' },
        { id: 'ass', codec: 'ass', external: false, label: 'Embedded ASS' }
      ]
    },
    editorState: {
      open: true, applying: false, selectedStreamID: '', subtitleSize: 100, offsetMs: 0,
      loop: false, status: '', previewMode: 'server', previewLoading: false,
      previewError: false, rendererType: null, bounds: { start: 0, end: 0 }
    }
  });
  h.controller.render();
  var model = h.viewCalls.filter(function (entry) { return entry[0] === 'render'; }).slice(-1)[0][1];
  assert.strictEqual(model.capabilities.size, false);
  assert.strictEqual(model.capabilities.background, false);
  assert.strictEqual(model.capabilities.edge, false);
  assert.strictEqual(model.capabilities.offset, false);
  assert.strictEqual(model.capabilities.loop, false);
  assert.strictEqual(model.capabilities.timeline, false);
  assert.strictEqual(model.capabilities['render-srt'], true);
  assert.strictEqual(model.capabilities['render-ass'], true);
}());

console.log('Player subtitle editor controller checks passed');
