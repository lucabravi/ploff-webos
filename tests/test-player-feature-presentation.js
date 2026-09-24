'use strict';

var assert = require('assert');
var Fixture = require('./helpers/player-feature-controller-harness');
var fakeNode = Fixture.fakeNode;
var createHarness = Fixture.createHarness;

(function deferredConstructionInitializesLocalizedTextWithoutTheEarlierShellTranslation() {
  var labels = {};
  var h = createHarness({ shell: {
    t: function (key) { return 'locale:' + key; },
    setText: function (id, value) { labels[id] = value; }
  } });
  assert.strictEqual(labels['player-settings-title'], 'locale:player.settings',
    'a deferred Player must initialize its labels without a second Shell translation pass');
  assert.strictEqual(h.nodes['player-next'].getAttribute('aria-label'), 'locale:player.next');
  h.controller.destroy();
}());

(function subtitleEditorStaticCopyIncludesResetAction() {
  var textCalls = [];
  var h = createHarness({
    shell: {
      t: function (key) { return key; },
      setText: function (id, value) { textCalls.push([id, value]); },
      element: function () { return fakeNode(); },
      cancelImages: function () {},
      stopTheme: function () {}
    }
  });
  h.controller.translateStatic();
  assert.ok(textCalls.some(function (entry) { return entry[0] === 'subtitle-editor-reset-label' && entry[1] === 'player.subtitleReset'; }),
    'advanced subtitle editor must render a localized Reset action label');
}());

(function playerSubtitleSettingDoesNotDuplicateRuntimeOwnershipBelowTheTrack() {
  var mode = 'local-loading';
  var textValues = {};
  var h = createHarness({
    playbackSnapshot: function (playbackValue, subtitleEditorState) {
      return {
        active: true,
        positionSeconds: 12,
        durationSeconds: 60,
        paused: false,
        subtitleEditor: subtitleEditorState,
        subtitleRenderMode: mode,
        playback: playbackValue
      };
    },
    shell: {
      t: function (key) { return key; },
      setText: function (id, value) { textValues[id] = value; },
      element: function () { return fakeNode(); },
      cancelImages: function () {},
      stopTheme: function () {}
    }
  });
  h.captured.controlsOptions.renderSettings({ settingsOpen: false, settingIndex: 0 });
  assert.strictEqual(textValues['setting-subtitles-mode'], undefined,
    'the Player settings subtitle row must not duplicate the renderer ownership badge already shown in the Player');
  mode = 'local';
  h.captured.controlsOptions.renderSettings({ settingsOpen: false, settingIndex: 0 });
  assert.strictEqual(textValues['setting-subtitles-mode'], undefined);
  mode = 'remote';
  h.captured.controlsOptions.renderSettings({ settingsOpen: false, settingIndex: 0 });
  assert.strictEqual(textValues['setting-subtitles-mode'], undefined);
  mode = 'off';
  h.captured.controlsOptions.renderSettings({ settingsOpen: false, settingIndex: 0 });
  assert.strictEqual(textValues['setting-subtitles-mode'], undefined);
}());

(function playbackInfoShowsRecoveryTraceBesideFinalDelivery() {
  var textValues = {};
  var playbackValue = {
    ratingKey: '42',
    playbackMode: 'direct-stream',
    diagnosticRecoveryTrace: 'DP > REOPEN[seek] > DP > FALLBACK[seek] > DS',
    options: { audioStreamID: '', subtitleStreamID: '', subtitleSize: 100, mediaIndex: 0, partIndex: 0, videoQuality: 'original', playbackMode: 'auto' },
    audioTracks: [], subtitleTracks: [], mediaVersions: [], markers: [], chapters: []
  };
  var h = createHarness({
    playbackValue: playbackValue,
    shell: {
      t: function (key) { return key; },
      setText: function (id, value) { textValues[id] = value; },
      element: function () { return fakeNode(); },
      cancelImages: function () {},
      stopTheme: function () {}
    }
  });
  h.captured.controlsOptions.renderSettings({ settingsOpen: false, settingIndex: 0 });
  assert.strictEqual(textValues['playback-info-mode'], 'player.directStream · DP > REOPEN[seek] > DP > FALLBACK[seek] > DS',
    'player information must expose the recovery path without requiring Web Inspector');
}());



(function playerMediaInfoPassesFullRecoveryTraceToModel() {
  var createArgs = null;
  var opened = null;
  var trace = 'DP > REOPEN[seek-startup-buffer] > DP > FALLBACK[recover:prepare] > DS';
  var playbackValue = {
    ratingKey: '42',
    diagnosticRecoveryTrace: trace,
    mediaProfile: { fileName: '/media/test.mkv' },
    options: { audioStreamID: '', subtitleStreamID: '', subtitleSize: 100, mediaIndex: 0, partIndex: 0, videoQuality: 'original', playbackMode: 'auto' },
    audioTracks: [], subtitleTracks: [], mediaVersions: [], markers: [], chapters: []
  };
  var h = createHarness({
    playbackValue: playbackValue,
    MediaInfo: {
      create: function (profile, options, translate, diagnostics) {
        createArgs = { profile: profile, options: options, translate: translate, diagnostics: diagnostics };
        return { sections: [] };
      },
      selectedTrack: function () { return null; }
    },
    dialogs: {
      openMediaInfo: function (model, origin) { opened = { model: model, origin: origin }; return true; }
    }
  });
  assert.strictEqual(typeof h.nodes['player-media-info'].onclick, 'function', 'player media-info button must be bound');
  h.nodes['player-media-info'].onclick();
  assert.ok(createArgs, 'opening Player media info must build a media info model');
  assert.strictEqual(createArgs.diagnostics.recoveryTrace, trace, 'Player media info must forward the complete recovery trace');
  assert.strictEqual(opened.origin, 'player', 'Player media info must retain its player origin');
}());

(function compactPlayerSummaryShowsOnlyTheEffectiveLocalSubtitleRendererBadge() {
  var mode = 'local';
  var rendererType = 'ass';
  var textValues = {};
  var playbackValue = {
    ratingKey: '42',
    options: { audioStreamID: '', subtitleStreamID: 's1', subtitleSize: 100, mediaIndex: 0, partIndex: 0, videoQuality: 'original', playbackMode: 'auto', localSubtitleOverlay: true },
    audioTracks: [],
    subtitleTracks: [{ id: 's1', language: 'it', title: 'Italiano', format: 'ass', external: true }],
    mediaVersions: [], markers: [], chapters: []
  };
  var h = createHarness({
    playbackValue: playbackValue,
    playbackSnapshot: function (current, subtitleEditorState) {
      return {
        active: true, positionSeconds: 12, durationSeconds: 60, paused: false,
        subtitleEditor: subtitleEditorState, subtitleRenderMode: mode,
        localSubtitle: mode === 'local' ? { rendererType: rendererType, streamId: 's1' } : null,
        playback: current
      };
    },
    shell: {
      t: function (key) { return key === 'player.localRenderer' ? 'LOCALE' : key; },
      setText: function (id, value) { textValues[id] = value; },
      element: function () { return fakeNode(); },
      cancelImages: function () {},
      stopTheme: function () {}
    }
  });

  h.captured.playbackOptions.onState(h.playback.snapshot());
  assert.strictEqual(textValues['player-subtitle-renderer-badge'], 'ASS / SSA · LOCALE',
    'effective local ASS rendering must be visible below the active subtitle');
  assert.ok(!/is-hidden/.test(h.nodes['player-subtitle-renderer-badge'].className),
    'effective local ASS badge must be visible');

  rendererType = null;
  h.captured.playbackOptions.onState(h.playback.snapshot());
  assert.strictEqual(textValues['player-subtitle-renderer-badge'], 'SRT / WebVTT · LOCALE',
    'effective local text rendering must identify the SRT/WebVTT renderer');

  mode = 'remote';
  playbackValue.options.localSubtitleOverlay = false;
  h.captured.playbackOptions.onState(h.playback.snapshot());
  assert.strictEqual(textValues['player-subtitle-renderer-badge'], '',
    'server/native subtitle ownership must not advertise local rendering');
  assert.ok(/is-hidden/.test(h.nodes['player-subtitle-renderer-badge'].className),
    'remote subtitle rendering must hide the local-renderer badge');

  mode = 'local-loading';
  playbackValue.options.localSubtitleOverlay = true;
  h.captured.playbackOptions.onState(h.playback.snapshot());
  assert.strictEqual(textValues['player-subtitle-renderer-badge'], '',
    'a local renderer that is still loading must not be presented as active');
}());

(function playPromotesTheCurrentAssIntentBeforeOpeningPlayback() {
  var promotions = [];
  var detail = { ratingKey: 'episode-current', type: 'episode' };
  var profile = { ratingKey: 'episode-current', partId: 'part-current' };
  var resolved = { subtitleTrack: { id: 'ass-current', format: 'ass', external: true, key: '/subtitles/current.ass' } };
  var h = createHarness({
    data: {
      prefetchCurrentAss: function (detailValue, profileValue, resolvedValue) {
        promotions.push({ detail: detailValue, profile: profileValue, resolved: resolvedValue });
      }
    },
    detail: {
      snapshot: function () { return { currentDetail: detail, selectedItem: detail }; },
      selectedMediaProfile: function () { return profile; },
      resolvedTracks: function () { return resolved; },
      queueSnapshot: function () { return {}; },
      preferenceSnapshot: function () { return {}; },
      hideSurface: function () {},
      setPlayPending: function () {}
    }
  });
  h.controller.open();
  assert.strictEqual(promotions.length, 1, 'pressing Play must promote the current ASS intent');
  assert.strictEqual(promotions[0].detail, detail, 'current-detail promotion must use the active media item');
  assert.strictEqual(promotions[0].profile, profile, 'current-detail promotion must use the selected media profile');
  assert.strictEqual(h.calls.filter(function (entry) { return entry[0] === 'open-playback'; }).length, 1,
    'current-detail promotion must still open the normal playback controller exactly once');
}());

(function foregroundAssOwnershipIsCancelledOnPlayerSourceChangesAndClose() {
  var cancellations = [];
  var h = createHarness({
    data: {
      cancelAssPrefetch: function (reason, preserveIdentity, includeForeground) {
        cancellations.push([reason, preserveIdentity, includeForeground]);
      }
    }
  });
  h.captured.playbackOptions.onTrackChanged();
  h.captured.playbackOptions.onVersionChanged();
  h.captured.controlsOptions.closePlayer();
  assert.deepStrictEqual(cancellations.slice(0, 3), [
    ['subtitle selection changed', '', true],
    ['media version changed', '', true],
    ['player closed', '', true]
  ], 'track/version changes and Player close must abort foreground ASS ownership tied to the previous target');
}());

(function timedNextAssPrefetchStartsOnceAtTheEffectiveTrigger() {
  var pendingNext = null;
  var requests = [];
  var cancellations = 0;
  var latestState = { positionSeconds: 0, durationSeconds: 1800, paused: false, subtitleEditor: {}, markers: [] };
  var current = {
    ratingKey: 'episode-current',
    options: { subtitleStreamID: '', subtitleSize: 100, mediaIndex: 0, partIndex: 0 },
    markers: []
  };
  var h = createHarness({
    playbackValue: current,
    playbackSnapshot: function (playbackValue, subtitleEditorState) {
      return {
        active: true,
        positionSeconds: latestState.positionSeconds,
        durationSeconds: latestState.durationSeconds,
        paused: latestState.paused,
        subtitleEditor: subtitleEditorState,
        playback: playbackValue
      };
    },
    resolveAdjacentState: function (direction, callback) {
      if (direction < 0) { callback(null, { state: 'unavailable' }); return { state: 'unavailable' }; }
      pendingNext = callback;
      return { state: 'resolving' };
    },
    data: {
      prefetchNextAss: function (target) { requests.push(target); },
      cancelAssPrefetch: function () { cancellations += 1; }
    }
  });
  h.captured.playbackOptions.onPlaybackLoaded(current, { detail: { ratingKey: 'episode-current' } });
  assert.strictEqual(typeof pendingNext, 'function', 'the existing next-target resolution must remain the source of the prefetch target');
  latestState.positionSeconds = 1600;
  h.captured.playbackOptions.onState(latestState);
  assert.strictEqual(requests.length, 0, 'a threshold reached before the next target resolves must wait without losing the intent');

  pendingNext(null, { state: 'available', index: 1, item: { ratingKey: 'episode-next', type: 'episode' } });
  assert.strictEqual(requests.length, 1, 'a target resolved after the threshold must prefetch immediately');
  latestState.positionSeconds = 1700;
  h.captured.playbackOptions.onState(latestState);
  assert.strictEqual(requests.length, 1, 'the same current/next identity must not trigger duplicate prefetches');

  h.captured.controlsOptions.closePlayer();
  assert.strictEqual(cancellations, 1, 'closing Player must cancel speculative ASS work');
}());

(function nextAssPrefetchRetriesWhenLocalRenderingWasUnavailable() {
  var pendingNext = null;
  var attempts = 0;
  var latestState = { positionSeconds: 1700, durationSeconds: 1800, paused: false, subtitleEditor: {}, markers: [] };
  var current = {
    ratingKey: 'episode-current',
    options: { subtitleStreamID: '', subtitleSize: 100, mediaIndex: 0, partIndex: 0 },
    markers: []
  };
  var h = createHarness({
    playbackValue: current,
    playbackSnapshot: function (playbackValue, subtitleEditorState) {
      return {
        active: true,
        positionSeconds: latestState.positionSeconds,
        durationSeconds: latestState.durationSeconds,
        paused: latestState.paused,
        subtitleEditor: subtitleEditorState,
        playback: playbackValue
      };
    },
    resolveAdjacentState: function (direction, callback) {
      if (direction < 0) { callback(null, { state: 'unavailable' }); return { state: 'unavailable' }; }
      pendingNext = callback;
      return { state: 'resolving' };
    },
    data: {
      prefetchNextAss: function () {
        attempts += 1;
        return attempts > 1;
      }
    }
  });
  h.captured.playbackOptions.onPlaybackLoaded(current, { detail: { ratingKey: 'episode-current' } });
  pendingNext(null, { state: 'available', index: 1, item: { ratingKey: 'episode-next', type: 'episode' } });
  assert.strictEqual(attempts, 1, 'the first due next-ASS prefetch may be rejected when local rendering is unavailable');
  h.captured.playbackOptions.onState(latestState);
  assert.strictEqual(attempts, 2, 'a synchronously rejected next-ASS prefetch must not consume the identity and must retry after local rendering becomes available');
}());

(function resumePointerFocusSelectsTheClickedChoice() {
  var buttons = [fakeNode('resume-choice-resume'), fakeNode('resume-choice-restart'), fakeNode('resume-choice-cancel')];
  var h = createHarness({
    querySelectorAll: function (selector) { return selector === '.resume-choice-actions button' ? buttons : []; },
    detail: {
      snapshot: function () {
        return {
          currentDetail: { ratingKey: '42', type: 'episode', viewOffset: 30000 },
          selectedItem: { ratingKey: '42', type: 'episode' }
        };
      },
      queueSnapshot: function () { return {}; },
      preferenceSnapshot: function () { return {}; },
      resumeAfterPlayer: function () {},
      leave: function () {},
      setPlayPending: function () {},
      showSurface: function () {},
      hideSurface: function () {}
    }
  });
  h.controller.open();
  assert.strictEqual(h.controller.snapshot().resumeChoiceOpen, true, 'resume playback must open its explicit choice dialog');
  assert.strictEqual(h.controller.pointerFocus('resume', 2), true, 'pointer focus must target the selected resume action');
  assert.strictEqual(buttons[2].className, 'is-focused', 'pointer focus must update the clicked resume action without rebuilding its button');
  assert.doesNotThrow(function () { h.controller.handleResumeKey({ keyCode: 13 }, ''); }, 'clicking Cancel must activate Cancel rather than the previously focused resume action');
  assert.strictEqual(h.controller.snapshot().resumeChoiceOpen, false, 'activating the pointer-selected Cancel action must close the resume dialog');
}());

(function standaloneExtraPlaybackKeepsParentDetailAndUsesIsolatedQueueContext() {
  var view = 'detail';
  var parent = { ratingKey: 'parent-movie', type: 'movie', title: 'Parent' };
  var extra = { ratingKey: 'trailer-1', type: 'clip', title: 'Trailer', viewOffset: 45000 };
  var resumed = 0;
  var h = createHarness({
    detail: {
      snapshot: function () { return { currentDetail: parent, selectedItem: parent, seriesContext: { seasons: [{ ratingKey: 's1' }], episodes: [{ ratingKey: 'e1' }] }, seasonIndex: 0, episodeIndex: 0 }; },
      queueSnapshot: function () { return { currentDetail: parent, seriesContext: { seasons: [{ ratingKey: 's1' }], episodes: [{ ratingKey: 'e1' }] }, seasonIndex: 0, episodeIndex: 0 }; },
      playbackPreferences: function () { return { playbackMode: 'auto' }; },
      preferenceSnapshot: function () { return {}; },
      hideSurface: function () {},
      showSurface: function () {},
      resumeAfterPlayer: function () { resumed += 1; },
      leave: function () {},
      setPlayPending: function () {}
    },
    state: {
      currentView: function () { return view; },
      setView: function (next) { view = next; },
      enterDetail: function () { view = 'detail'; },
      pointerSelectionActive: function () { return false; }
    }
  });

  assert.strictEqual(h.controller.openStandalone({ item: extra, detail: extra, resume: false }), true, 'standalone extra playback must be accepted');
  assert.strictEqual(view, 'player', 'standalone extra playback must enter the Player surface');
  assert.strictEqual(h.controller.snapshot().resumeChoiceOpen, false, 'standalone extras requested with resume disabled must start immediately instead of opening the resume dialog');
  assert.strictEqual(h.calls.filter(function (entry) { return entry[0] === 'open-playback'; }).pop()[1].detail.ratingKey, 'trailer-1', 'PlaybackController must open the selected extra rather than the parent title');
  assert.strictEqual(h.captured.playerQueueOptions.detailSnapshot().currentDetail.ratingKey, 'trailer-1', 'Player queue context must follow the standalone extra while it is active');
  assert.strictEqual(h.captured.playerQueueOptions.detailSnapshot().seriesContext, null, 'standalone extras must not inherit the parent series queue');
  assert.strictEqual(parent.ratingKey, 'parent-movie', 'the retained parent Detail object must remain untouched');

  h.captured.playbackOptions.onEnded();
  assert.strictEqual(h.calls.filter(function (entry) { return entry[0] === 'playback-ended'; }).length, 0,
    'ending a standalone extra must not enter the normal end-of-queue autoplay flow');
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'hold-visible'; }),
    'ending a standalone extra must leave the completed Player controls visible for an explicit Back to Detail');

  h.captured.controlsOptions.closePlayer();
  assert.strictEqual(view, 'detail', 'closing a standalone extra must return to Detail');
  assert.strictEqual(resumed, 1, 'closing a standalone extra must resume the retained parent Detail exactly once');
  assert.strictEqual(h.captured.playerQueueOptions.detailSnapshot().currentDetail.ratingKey, 'parent-movie', 'after close the Player queue snapshot must return to the parent Detail context');
  h.controller.openStandalone({ item: extra, detail: extra, resume: false });
  h.controller.destroy();
  assert.strictEqual(h.captured.playerQueueOptions.detailSnapshot().currentDetail.ratingKey, 'parent-movie', 'destroy must release the transient standalone Detail override');
}());

(function errorsWithoutRetryHideTheRetryCommand() {
  var errorButtons = [fakeNode('player-error-retry'), fakeNode('player-error-settings'), fakeNode('player-error-back')];
  var h = createHarness({
    querySelectorAll: function (selector) { return selector === '.player-error-actions button' ? errorButtons : []; }
  });
  h.captured.playbackOptions.showError(false, null);
  assert.strictEqual(h.nodes['player-error-retry'].disabled, true, 'errors without a retry callback must disable Retry');
  assert.ok(/is-hidden/.test(h.nodes['player-error-retry'].className), 'errors without a retry callback must not present Retry as a usable action');
  assert.strictEqual(errorButtons[1].focusCount, 1, 'errors without Retry must focus the next usable action');
}());

(function forcedDirectErrorOffersAutomaticModeInPlayerUi() {
  var errorButtons = [fakeNode('player-error-retry'), fakeNode('player-error-settings'), fakeNode('player-error-back')];
  var h = createHarness({
    querySelectorAll: function (selector) { return selector === '.player-error-actions button' ? errorButtons : []; }
  });
  assert.strictEqual(typeof h.captured.playbackOptions.onDirectPlaybackFailure, 'function', 'Player must expose the forced-Direct fallback callback');
  h.captured.playbackOptions.onDirectPlaybackFailure(new Error('unsupported codec'), function () {}, function () { h.calls.push(['switch-automatic']); });
  assert.strictEqual(h.nodes['player-error'].className, 'player-error', 'a forced-Direct failure must open the player error surface');
  h.controller.handleErrorKey({ keyCode: 39 }, 'right');
  h.controller.handleErrorKey({ keyCode: 13 }, '');
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'switch-automatic'; }), 'the secondary error action must switch to Automatic without opening settings');
}());

(function injectsNativeVideoDriverIntoPlaybackFacade() {
  var NativeVideoDriver = { create: function () {} };
  var h = createHarness({ NativeVideoDriver: NativeVideoDriver });
  assert.strictEqual(h.captured.playbackOptions.NativeVideoDriver, NativeVideoDriver,
    'Player must inject the physical native-video capability into Playback explicitly');
}());

(function playerControlsExposeSeekSettlementAcrossPlaybackPhases() {
  var phases = [
    { pendingSeek: 30, nativeSeekPending: false, decoderSettlementPending: false, streamSwitching: false },
    { pendingSeek: null, nativeSeekPending: true, decoderSettlementPending: false, streamSwitching: false },
    { pendingSeek: null, nativeSeekPending: false, decoderSettlementPending: true, streamSwitching: false },
    { pendingSeek: null, nativeSeekPending: false, decoderSettlementPending: false, streamSwitching: true }
  ];
  phases.forEach(function (phase) {
    var h = createHarness({
      playbackSnapshot: function (playbackValue, subtitleEditorState) {
        return {
          active: true, positionSeconds: 30, durationSeconds: 60, paused: false,
          subtitleEditor: subtitleEditorState, playback: playbackValue,
          pendingSeek: phase.pendingSeek, nativeSeekPending: phase.nativeSeekPending,
          decoderSettlementPending: phase.decoderSettlementPending, streamSwitching: phase.streamSwitching
        };
      }
    });
    assert.strictEqual(h.captured.controlsOptions.playbackSnapshot().seekSettling, true,
      'skip controls must know that playback is still settling across every reposition phase');
    h.controller.destroy();
  });

  var stable = createHarness({
    playbackSnapshot: function (playbackValue, subtitleEditorState) {
      return {
        active: true, positionSeconds: 30, durationSeconds: 60, paused: false,
        subtitleEditor: subtitleEditorState, playback: playbackValue,
        pendingSeek: null, nativeSeekPending: false, decoderSettlementPending: false, streamSwitching: false
      };
    }
  });
  assert.strictEqual(stable.captured.controlsOptions.playbackSnapshot().seekSettling, false,
    'stable playback must release skip-marker seek protection');
  stable.controller.destroy();
}());

(function injectsPlaybackRepositionIntoPlaybackFacade() {
  var PlaybackReposition = { create: function () {} };
  var h = createHarness({ PlaybackReposition: PlaybackReposition });
  assert.strictEqual(h.captured.playbackOptions.PlaybackReposition, PlaybackReposition,
    'Player must inject reposition policy into Playback explicitly');
}());

(function injectsPlaybackSessionIntoPlaybackFacade() {
  var PlaybackSession = { create: function () {} };
  var h = createHarness({ PlaybackSession: PlaybackSession });
  assert.strictEqual(h.captured.playbackOptions.PlaybackSession, PlaybackSession,
    'Player must inject lifecycle state ownership into Playback explicitly');
}());

(function injectsPlaybackTimelineIntoPlaybackFacade() {
  var PlaybackTimeline = { create: function () {} };
  var h = createHarness({ PlaybackTimeline: PlaybackTimeline });
  assert.strictEqual(h.captured.playbackOptions.PlaybackTimeline, PlaybackTimeline,
    'Player must inject timeline clock/report ownership into Playback explicitly');
}());

(function injectsSubtitleRuntimeIntoPlaybackFacade() {
  var SubtitleRuntime = { create: function () {} };
  var h = createHarness({ SubtitleRuntime: SubtitleRuntime });
  assert.strictEqual(h.captured.playbackOptions.SubtitleRuntime, SubtitleRuntime,
    'Player must inject active subtitle runtime ownership into Playback explicitly');
}());

(function createsDedicatedSubtitleEditorPresentationOwner() {
  var h = createHarness();
  assert.strictEqual(h.creates.subtitleEditor, 1, 'Player must create exactly one dedicated subtitle-editor presentation controller');
  assert.ok(h.captured.subtitleEditorOptions, 'Player must inject subtitle-editor dependencies explicitly');
}());

(function createsDedicatedQueuePresentationOwner() {
  var h = createHarness();
  assert.strictEqual(h.creates.playerQueue, 1, 'Player must create exactly one dedicated queue-presentation controller');
  assert.strictEqual(h.captured.playerQueueOptions.queueController, h.queue,
    'the queue presentation owner must receive the private playback-queue domain capability');
}());

(function constructsAndHidesOwnedControllers() {
  var h = createHarness();
  assert.deepStrictEqual(h.creates, { queue: 1, playerQueue: 1, playback: 1, controls: 1, subtitleEditor: 1, gapView: 1 }, 'the feature must construct each owned controller exactly once');
  Object.keys(h.controller).forEach(function (key) {
    assert.notStrictEqual(h.controller[key], h.queue, 'the queue controller must stay private');
    assert.notStrictEqual(h.controller[key], h.playerQueue, 'the queue presentation controller must stay private');
    assert.notStrictEqual(h.controller[key], h.playback, 'the playback controller must stay private');
    assert.notStrictEqual(h.controller[key], h.controls, 'the controls controller must stay private');
  });
  assert.strictEqual(h.controller.playbackSnapshot().active, true);
  assert.strictEqual(h.controller.playbackSnapshot().playback.ratingKey, '42');
  assert.deepStrictEqual(h.controller.playbackDiagnostics(), { ratingKey: '42', state: 'playing' });
  assert.deepStrictEqual(h.controller.snapshot().queue, { playlistQueue: { id: 'queue' }, drawer: { open: false }, destroyed: false });
  assert.strictEqual(h.controller.controlsSnapshot().mode, 'full');
}());



(function asyncNextAvailabilityAlsoWarmsTheAutoplayBackdrop() {
  var pendingNext = null;
  var imageSources = [];
  var root = {
    setTimeout: function (fn) { fn(); return 1; },
    clearTimeout: function () {},
    Image: function () {
      var image = this;
      Object.defineProperty(image, 'src', {
        set: function (value) { imageSources.push(value); },
        get: function () { return ''; }
      });
    }
  };
  var h = createHarness({
    root: root,
    resolveAdjacentState: function (direction, callback) {
      if (direction < 0) {
        callback(null, { state: 'unavailable' });
        return { state: 'unavailable' };
      }
      pendingNext = callback;
      return { state: 'resolving' };
    },
    settings: { settings: function () { return { autoplayDelay: 10 }; } },
    shell: {
      t: function (key) { return key; },
      setText: function () {},
      element: function () { return fakeNode(); },
      cancelImages: function () {},
      stopTheme: function () {},
      artworkUrl: function (item) { return item && item.art || ''; }
    },
    data: {
      config: {},
      PlexClient: {
        posterUrl: function (_config, source, width, height) {
          return source + '?w=' + width + '&h=' + height;
        }
      },
      playbackCapabilities: function () { return {}; },
      activeServer: function () { return null; }
    },
    detail: {
      snapshot: function () { return { currentDetail: { ratingKey: '42', type: 'episode' } }; },
      queueSnapshot: function () { return { currentDetail: { ratingKey: '42', type: 'episode' } }; },
      preferenceSnapshot: function () { return {}; },
      resumeAfterPlayer: function () {},
      leave: function () {}
    }
  });

  h.captured.playbackOptions.onPlaybackLoaded({ ratingKey: '42' }, { detail: { ratingKey: '42' } });
  assert.strictEqual(typeof pendingNext, 'function', 'playback load must leave the asynchronous Next availability request pending');
  assert.strictEqual(imageSources.length, 0, 'the backdrop cannot be warm before the asynchronous Next item resolves');

  pendingNext(null, {
    state: 'available', index: 1,
    item: { ratingKey: '43', type: 'episode', art: '/library/metadata/43/art' }
  });

  assert.strictEqual(imageSources.length, 1,
    'the resolved Next availability result must warm the Up Next backdrop instead of losing the prefetch behind the in-flight lookup');
  assert.ok(/\/library\/metadata\/43\/art/.test(imageSources[0]),
    'the warmed backdrop must belong to the resolved next queue item');
}());

(function featureSnapshotUsesCheapQueueGapOwnerQueryWithoutCopyingTheConfirmation() {
  var gapSnapshotReads = 0;
  var gapOpen = false;
  var stateCallback = null;
  var h = createHarness({
    QueueGapController: {
      create: function (options) {
        stateCallback = options.onState;
        return {
          open: function () { gapOpen = true; stateCallback({ open: true, focus: 0, confirmation: { token: 'large-gap' } }); return true; },
          invalidate: function () { gapOpen = false; stateCallback({ open: false, focus: 0, confirmation: null }); return true; },
          isOpen: function () { return gapOpen; },
          snapshot: function () { gapSnapshotReads += 1; return { open: true, confirmation: { token: 'copied' } }; },
          handleKey: function () { return false; },
          destroy: function () {}
        };
      }
    }
  });
  h.captured.queueOptions.onGapRequired({
    token: 'large-gap', generation: 1,
    target: { occurrenceId: 'series:1:2', item: { ratingKey: 's1e2' } }
  }, 'manual');
  gapSnapshotReads = 0;
  assert.strictEqual(h.controller.snapshot().queueGapOpen, true);
  assert.strictEqual(gapSnapshotReads, 0,
    'the Player hot snapshot must query only queue-gap owner visibility instead of copying the full confirmation');
}());


(function queueKeyCaptureReadsHotPathSnapshotsOnce() {
  var queueReads = 0;
  var viewReads = 0;
  var h = createHarness({
    queueSnapshot: { playlistQueue: { id: 'queue' }, drawer: { open: true, index: 2 }, directPlayPending: false, destroyed: false },
    onQueueSnapshot: function () { queueReads += 1; },
    state: {
      currentView: function () { viewReads += 1; return 'player'; },
      setView: function () {},
      pointerSelectionActive: function () { return false; }
    }
  });
  queueReads = 0;
  viewReads = 0;
  h.controller.handleQueueCapture({ keyCode: 38, preventDefault: function () {} });
  assert.strictEqual(queueReads, 1, 'queue key routing must read the queue snapshot once');
  assert.strictEqual(viewReads, 1, 'queue key routing must read the active view once');
}());

(function queueClosePointerControlIsNotHandledAsAQueueCommand() {
  var button = fakeNode('player-playlist-queue-close');
  var h = createHarness({
    queueSnapshot: { playlistQueue: { id: 'queue' }, drawer: { open: true, index: 0 }, directPlayPending: false, destroyed: false },
    state: { currentView: function () { return 'player'; }, setView: function () {}, pointerSelectionActive: function () { return false; } }
  });
  h.controller.pointerCaptureClick({ preventDefault: function () {} }, button);
  assert.strictEqual(h.calls.some(function (entry) { return entry[0] === 'close-drawer'; }), false, 'the removed Queue Close pointer control must not add a second close path');
}());

(function chapterDrawerDoesNotExposeARedundantCloseControl() {
  var h = createHarness();
  assert.strictEqual(h.nodes['player-chapters-close'], undefined, 'the Chapters drawer must not expose a redundant Close control');
}());

(function queuePointerRoutingReadsSnapshotsOnce() {
  var queueReads = 0;
  var viewReads = 0;
  var detailReads = 0;
  var button = fakeNode('queue-card');
  button.setAttribute('data-playlist-queue-index', '3');
  var h = createHarness({
    queueSnapshot: { playlistQueue: { id: 'queue' }, drawer: { open: true, index: 3 }, directPlayPending: false, destroyed: false },
    onQueueSnapshot: function () { queueReads += 1; },
    activeQueue: function () { return null; },
    detail: {
      snapshot: function () { detailReads += 1; return {}; },
      queueSnapshot: function () { return {}; },
      preferenceSnapshot: function () { return {}; }
    },
    state: {
      currentView: function () { viewReads += 1; return 'player'; },
      setView: function () {},
      pointerSelectionActive: function () { return false; }
    }
  });
  queueReads = 0;
  viewReads = 0;
  detailReads = 0;
  h.controller.pointerCaptureClick({ preventDefault: function () {} }, button);
  assert.strictEqual(queueReads, 1, 'queue pointer routing must read the queue snapshot once');
  assert.strictEqual(viewReads, 1, 'queue pointer routing must read the active view once');
  assert.strictEqual(detailReads, 1, 'queue pointer routing must read detail state once');
}());

(function queueButtonRoutingReadsControlsOnce() {
  var controlReads = 0;
  var h = createHarness({ onControlsSnapshot: function () { controlReads += 1; } });
  controlReads = 0;
  h.controller.handleQueueCapture({ keyCode: 13, preventDefault: function () {} });
  assert.strictEqual(controlReads, 1, 'queue-button routing must read controls state once');
}());

(function playlistActivationReadsDetailSnapshotOnce() {
  var detailReads = 0;
  var button = fakeNode('detail-play');
  var h = createHarness({
    activatePlaylist: function () { return { context: {}, index: 0 }; },
    detail: {
      snapshot: function () {
        detailReads += 1;
        return { currentDetail: { ratingKey: '42', type: 'show' }, seriesContext: {}, seasonIndex: 0, episodeIndex: 0 };
      },
      queueSnapshot: function () { return {}; },
      preferenceSnapshot: function () { return {}; },
      setPlaylistContext: function () {},
      setPlayPending: function () {}
    },
    state: {
      currentView: function () { return 'detail'; },
      setView: function () {},
      pointerSelectionActive: function () { return false; }
    }
  });
  detailReads = 0;
  h.controller.pointerCaptureClick({ preventDefault: function () {} }, button);
  assert.strictEqual(detailReads, 1, 'playlist activation must read the detail snapshot once');
}());

(function queuePresentationReadsTheQueueSnapshotOnce() {
  var reads = 0;
  var h = createHarness({
    onQueueSnapshot: function () { reads += 1; },
    activeQueue: function () { return { title: 'Queue', items: [] }; }
  });
  reads = 0;
  h.captured.queueOptions.onQueueChanged();
  assert.strictEqual(reads, 1, 'one queue publication must not clone the queue snapshot repeatedly');
}());

(function openQueuePublicationReusesDrawerState() {
  var queueReads = 0;
  var detailReads = 0;
  var activeQueueReads = 0;
  var queue = { kind: 'series', title: 'Queue', items: [{ ratingKey: '42' }], index: 0 };
  var h = createHarness({
    queueSnapshot: {
      sequence: { identity: 'series|show' },
      playlistQueue: queue,
      drawer: { open: true, index: 0, focusReady: true, queue: queue, currentIndex: 0 },
      destroyed: false
    },
    onQueueSnapshot: function () { queueReads += 1; },
    activeQueue: function () { activeQueueReads += 1; return queue; },
    detail: {
      snapshot: function () {
        detailReads += 1;
        return { currentDetail: { ratingKey: '42' }, seriesContext: {}, seasonIndex: 0, episodeIndex: 0 };
      }
    }
  });
  queueReads = 0;
  detailReads = 0;
  activeQueueReads = 0;
  h.captured.queueOptions.onQueueChanged();
  assert.strictEqual(queueReads, 1, 'an open queue publication must read its queue snapshot once');
  assert.strictEqual(detailReads, 1, 'an open queue publication must reuse one detail snapshot');
  assert.strictEqual(activeQueueReads, 0, 'an open queue publication must reuse the queue included in drawer state');
}());

(function queueDetailSnapshotReadsTheDetailDomainOnce() {
  var reads = 0;
  var detailState = {
    currentDetail: { ratingKey: 'detail-1' },
    seriesContext: { episodes: [] },
    seasonIndex: 2,
    episodeIndex: 3
  };
  var h = createHarness({
    detail: {
      snapshot: function () { reads += 1; return detailState; },
      queueSnapshot: function () { return {}; },
      preferenceSnapshot: function () { return {}; }
    }
  });
  reads = 0;
  assert.deepStrictEqual(h.captured.queueOptions.currentDetailSnapshot(), detailState);
  assert.strictEqual(reads, 1, 'one queue snapshot must read the detail feature only once on the input hot path');
}());

(function playerPanelsRestoreSubtitleOverlayToItsNaturalPosition() {
  var h = createHarness();
  var view = h.document.getElementById('player-view');
  view.className = 'player-view has-player-controls has-player-controls-full';
  h.captured.controlsOptions.onSettingsOpenChanged(true);
  assert.ok(view.className.indexOf('has-player-panel-open') >= 0, 'opening player settings must detach subtitles from the hidden control bar');
}());

(function openPlayerSettingsRetainFocusDuringPlaybackUpdates() {
  var buttons = [fakeNode('player-toggle'), fakeNode('player-settings-button')];
  var h = createHarness({
    querySelectorAll: function (selector) {
      if (selector === '.player-button') { return buttons; }
      return [];
    }
  });
  h.captured.controlsOptions.renderFocus({
    mode: 'full', visible: true, zone: 'buttons', buttonIndex: 1,
    settingsOpen: true, settingIndex: 0, chapter: { open: false }, skip: { visible: false }
  });
  assert.strictEqual(buttons[1].focusCount, 0,
    'playback updates must not return DOM focus to a player command while settings own input');
  assert.strictEqual(buttons[1].className.indexOf('is-focused'), -1,
    'the hidden player command must not retain a competing focus outline while settings are open');
}());

(function openPlayerSettingsDuringInitialBufferOwnsFocusBeforePlaybackLoads() {
  var rows = [fakeNode('setting-audio'), fakeNode('setting-close')];
  rows[0].getAttribute = function (name) { return name === 'data-setting' ? 'audio' : ''; };
  rows[1].getAttribute = function (name) { return name === 'data-setting' ? 'close' : ''; };
  var h = createHarness({
    querySelectorAll: function (selector) {
      return selector === '.setting-row, .playback-info' ? rows : [];
    },
    playbackSnapshot: function () {
      return { active: true, positionSeconds: 0, durationSeconds: 0, paused: true, playback: null };
    }
  });
  h.captured.controlsOptions.renderSettings({ settingsOpen: true, settingIndex: 1 });
  assert.strictEqual(rows[1].focusCount, 1,
    'opening settings while the initial playback buffer is unresolved must focus a settings row immediately');
}());

(function playbackLoadedDoesNotResetPlayerSettingsThatOpenedDuringBuffering() {
  var h = createHarness({ controlsSettingsOpen: true });
  var start = h.calls.length;
  h.captured.playbackOptions.onPlaybackLoaded({ ratingKey: '42' }, { detail: { ratingKey: '42' } });
  assert.strictEqual(h.controller.controlsSnapshot().settingsOpen, true,
    'settings opened during buffering must remain open when playback metadata arrives');
  assert.strictEqual(h.calls.slice(start).some(function (entry) { return entry[0] === 'initialize-hidden'; }), false,
    'late playback metadata must not reset the controls while settings own focus');
}());

(function upNextItemsExposeArtworkSourceWithoutPreSizing() {
  var posterCalls = [];
  var sourceRouter = require('../app/coordinator/plex-source-router').create({ sources: {
    contextForMachine: function (machine) {
      return machine === 'server-b' ? { serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://b.example', token: 'b-token' } : null;
    }
  } });
  var h = createHarness({ data: { sourceRouter: sourceRouter,
    PlexClient: { posterUrl: function () { posterCalls.push(Array.prototype.slice.call(arguments)); return 'unexpected'; } } } });
  var item = h.captured.queueOptions.upNextItem({ item: {
    ratingKey: 'next', image: '/next.jpg', title: 'Next',
    serverMachineIdentifier: 'server-b', sourceId: 'server-b|4', serverName: 'Marco'
  } }, 'bottom-panel');
  assert.strictEqual(item.imageSource, '/next.jpg', 'the Up Next view must receive the original artwork source for DOM-sized generation');
  assert.strictEqual(item.serverMachineIdentifier, 'server-b', 'the Up Next media model must retain the owning PMS identifier');
  assert.strictEqual(item.sourceId, 'server-b|4', 'the Up Next media model must retain its source identity');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(item, 'imageUrl'), false, 'the player feature must not pre-generate a 2x Up Next cover');
  assert.deepStrictEqual(posterCalls, [], 'Up Next cover sizing belongs to the rendered view, not the player orchestrator');
}());

(function playerOwnedArtworkRequestsRespectArtworkQuality() {
  var posterCalls = [];
  var h = createHarness({
    data: {
      PlexClient: {
        posterUrl: function (_config, source, width, height) {
          posterCalls.push([source, width, height]);
          return source + '@' + width + 'x' + height;
        }
      }
    },
    settings: { settings: function () { return { artworkQuality: 80, backdropQuality: 70 }; } }
  });
  assert.strictEqual(h.captured.upNextViewOptions.resolveImageUrl('/next.jpg', 200, 300), '/next.jpg@160x240');
  assert.strictEqual(h.captured.gapViewOptions.resolveImageUrl('/gap.jpg', 320, 180), '/gap.jpg@256x144');
  assert.deepStrictEqual(posterCalls, [
    ['/next.jpg', 160, 240],
    ['/gap.jpg', 256, 144]
  ], 'player-owned cards must use artwork quality without changing their rendered boxes');
}());

(function dismissedUpNextKeepsTheEndedPlayerControlsVisible() {
  var h = createHarness();
  h.captured.queueOptions.onUpNextCancelled();
  assert.deepStrictEqual(
    h.calls.filter(function (entry) { return entry[0] === 'hold-visible' || entry[0] === 'seek'; }),
    [['hold-visible']],
    'dismissing Up Next must leave the player controls persistently visible without seeking a completed stream'
  );
}());

(function exhaustedQueueUsesHomeAsTheTerminalAutoplayTarget() {
  var h = createHarness();
  var target = h.captured.queueOptions.endOfQueueTarget();
  var item = h.captured.queueOptions.upNextItem(target, 'compact');
  assert.strictEqual(target.action, 'home');
  assert.strictEqual(item.action, 'home');
  assert.strictEqual(item.title, 'nav.home');
  assert.strictEqual(item.imageUrl, 'ploff-logo.svg');
}());

(function showingUpNextAlwaysClearsThePlayerLoader() {
  var h = createHarness();
  h.captured.playbackOptions.onEnded();
  assert.ok(h.calls.some(function (entry) {
    return entry[0] === 'player-loading' && entry[1] === false;
  }), 'Up Next must never share the player surface with a stale loading spinner');
}());

(function cancellingTerminalAutoplayShowsPauseOnlyAtTheEnd() {
  var h = createHarness();
  h.captured.playbackOptions.onEnded();
  h.captured.queueOptions.onUpNextCancelled({ action: 'home' });
  assert.strictEqual(h.nodes['player-end-pause'].className, 'player-end-pause');
  assert.strictEqual(h.nodes['player-end-pause'].getAttribute('aria-hidden'), 'false');
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'initialize-hidden'; }), 'the terminal pause overlay must replace completed player controls without arming a Back grace period');
  h.captured.queueOptions.onUpNextRearmed();
  assert.strictEqual(h.nodes['player-end-pause'].className, 'player-end-pause is-hidden', 'moving away from the end must hide the terminal pause overlay');
}());

(function terminalAutoplayCompletionClosesPlaybackAndEntersHome() {
  var h = createHarness();
  h.captured.queueOptions.requestHome();
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'close'; }), 'Home completion must close native playback first');
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'clear-queue'; }), 'the exhausted queue must be cleared before returning Home');
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'enter-home'; }), 'the terminal autoplay action must enter Home');
}());

(function closingPlaybackReentersDetailThroughTheSurfaceBoundary() {
  var h = createHarness();
  h.captured.controlsOptions.closePlayer();
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'enter-detail'; }), 'Player Back must re-enter Detail through the composition boundary so no browsing surface remains visible');
}());

(function leavingTheEndedPlayerHidesThePauseOverlay() {
  var h = createHarness();
  h.captured.playbackOptions.onEnded();
  h.captured.queueOptions.onUpNextCancelled({ action: 'home' });
  h.captured.queueOptions.closePlayer();
  assert.strictEqual(h.nodes['player-end-pause'].className, 'player-end-pause is-hidden', 'Back from the ended player must remove the pause overlay');
}());

(function rewindingAfterDismissedUpNextRestoresTheNormalControlsTimeout() {
  var h = createHarness();
  h.captured.queueOptions.onUpNextRearmed();
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'resume-auto-hide'; }), 'rewinding far enough from the end restores automatic controls hiding');
}());


(function publicPlayerSnapshotsAreMutationIsolated() {
  var h = createHarness();
  var playback = h.controller.playbackSnapshot();
  var queue = h.controller.snapshot().queue;

  playback.playback.ratingKey = 'mutated';
  playback.playback.options.videoQuality = 'mutated';
  queue.playlistQueue.id = 'mutated';
  queue.drawer.open = true;

  assert.strictEqual(h.controller.playbackSnapshot().playback.ratingKey, '42', 'public playback snapshots must not expose the native playback record');
  assert.strictEqual(h.controller.playbackSnapshot().playback.options.videoQuality, 'original', 'public playback option DTOs must be copied');
  assert.strictEqual(h.controller.snapshot().queue.playlistQueue.id, 'queue', 'public queue snapshots must be copied');
  assert.strictEqual(h.controller.snapshot().queue.drawer.open, false, 'public drawer state must be copied');
}());

(function semanticDelegationDoesNotExposeImplementation() {
  var h = createHarness();
  assert.strictEqual(h.controller.handleQueueKey({ keyCode: 13 }, ''), 'queue');
  assert.strictEqual(h.controller.handleControlsKey({ keyCode: 39 }, 'right'), 'controls');
  assert.strictEqual(h.controller.pointerFocus('button', 1), true);
  assert.strictEqual(h.controller.pointerActivity(), true);
  assert.strictEqual(h.controller.pointerSeek(77), true);
  h.controller.resetSeekRepeat();
  assert.strictEqual(h.controller.settingIndex(), 2);
  assert.deepStrictEqual(h.calls, [
    ['queue-key', 13, ''],
    ['controls-key', 39, 'right'],
    ['pointer-focus', 'button', 1],
    ['pointer-activity'],
    ['pointer-seek', 77],
    ['reset-seek']
  ]);
}());

(function drawerStateRenderReadsOneSnapshotPerPhase() {
  var detailReads = 0;
  var queueReads = 0;
  var activeQueueReads = 0;
  var queue = { kind: 'series', title: 'Queue', items: [{ ratingKey: '42' }], index: 0 };
  var h = createHarness({
    activeQueue: function () { activeQueueReads += 1; return queue; },
    onQueueSnapshot: function () { queueReads += 1; },
    detail: {
      snapshot: function () {
        detailReads += 1;
        return { currentDetail: { ratingKey: '42' }, seriesContext: {}, seasonIndex: 0, episodeIndex: 0 };
      }
    }
  });
  detailReads = 0;
  queueReads = 0;
  activeQueueReads = 0;
  h.captured.queueOptions.onDrawerState({ open: true, index: 0, focusReady: true, queue: queue, currentIndex: 0 });
  assert.strictEqual(detailReads, 1,
    'one remote drawer update must reuse one detail snapshot across render and focus');
  assert.strictEqual(queueReads, 0,
    'the supplied drawer state must avoid cloning the complete queue snapshot');
  assert.strictEqual(activeQueueReads, 0,
    'the supplied drawer queue must avoid resolving the active queue again');
  detailReads = 0;
  h.captured.queueOptions.onDrawerState({ open: false, index: 0, focusReady: false, queue: queue, currentIndex: 0 });
  assert.strictEqual(detailReads, 0,
    'closing the drawer must not read detail state when no queue window is rendered');
}());

(function teardownIsReverseOrderAndIdempotent() {
  var h = createHarness();
  h.controller.destroy();
  h.controller.destroy();
  assert.deepStrictEqual(h.destroyed, ['controls', 'subtitle-editor', 'playback', 'player-queue', 'queue'], 'owned controllers must be destroyed once in reverse construction order');
  assert.strictEqual(h.calls.filter(function (entry) { return entry[0] === 'resolver-cancel'; }).length, 0, 'the legacy detail-only episode resolver must not be owned by the player feature');
  assert.strictEqual(h.controller.snapshot().destroyed, true);
  assert.strictEqual(h.controller.handleControlsKey({ keyCode: 13 }, ''), false, 'destroyed features must reject input');
}());


console.log('Player feature presentation checks passed');
