'use strict';

var assert = require('assert');
var MediaChoiceModel = require('../app/media-choice-model');
var PlayerFeatureController = require('../app/coordinator/player-feature-controller');
var PlaybackQueueModel = require('../app/playback-queue-model');
var QueueGapController = require('../app/coordinator/queue-gap-controller');
var ResumeChoice = require('../app/resume-choice');
var ProgressiveImages = require('../app/progressive-images');

function fakeNode(id) {
  var attributes = {};
  var listeners = {};
  return {
    id: id || '', className: '', style: {}, disabled: false, onclick: null, firstChild: { textContent: '' },
    setAttribute: function (name, value) { attributes[name] = String(value); },
    removeAttribute: function (name) { delete attributes[name]; },
    appendChild: function () {}, insertBefore: function () {},
    addEventListener: function (name, handler) { listeners[name] = handler; },
    removeEventListener: function (name, handler) { if (listeners[name] === handler) { delete listeners[name]; } },
    focus: function () {},
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    hasAttribute: function (name) { return Object.prototype.hasOwnProperty.call(attributes, name); },
    getAttribute: function (name) { return attributes[name] || ''; },
    listener: function (name) { return listeners[name] || null; }
  };
}

function extend(base, patch) {
  var result = {};
  var key;
  base = base || {};
  patch = patch || {};
  for (key in base) { if (Object.prototype.hasOwnProperty.call(base, key)) { result[key] = base[key]; } }
  for (key in patch) { if (Object.prototype.hasOwnProperty.call(patch, key)) { result[key] = patch[key]; } }
  return result;
}

function createDeferredClock() {
  var nextId = 1;
  var timers = {};
  return {
    root: {
      setTimeout: function (callback, delay) {
        var id = nextId;
        nextId += 1;
        timers[id] = { callback: callback, delay: Number(delay || 0) };
        return id;
      },
      clearTimeout: function (id) { delete timers[id]; }
    },
    pending: function () { return Object.keys(timers).length; },
    runAll: function () {
      var ids = Object.keys(timers).map(Number).sort(function (left, right) { return left - right; });
      ids.forEach(function (id) {
        var timer = timers[id];
        delete timers[id];
        if (timer) { timer.callback(); }
      });
    }
  };
}

function createHarness(overrides) {
  var values = overrides || {};
  var creates = { queue: 0, playback: 0, controls: 0, gapView: 0 };
  var destroyed = [];
  var calls = [];
  var nodes = {};
  var captured = {};
  var documentRef = {
    body: fakeNode('body'),
    getElementById: function (id) { if (!nodes[id]) { nodes[id] = fakeNode(id); } return nodes[id]; },
    querySelector: function () { return null; },
    querySelectorAll: function (selector) { return values.querySelectorAll ? values.querySelectorAll(selector) : []; },
    createElement: function (tag) { return fakeNode(tag); },
    addEventListener: function () {}, removeEventListener: function () {}
  };
  var queueSnapshot = values.queueSnapshot || { playlistQueue: { id: 'queue' }, drawer: { open: false }, destroyed: false };
  var playbackValue = {
    ratingKey: '42',
    options: { audioStreamID: '', subtitleStreamID: '', subtitleSize: 100, mediaIndex: 0, partIndex: 0, videoQuality: 'original', playbackMode: 'auto' },
    audioTracks: [], subtitleTracks: [], mediaVersions: [], markers: [], chapters: []
  };
  var queue = {
    snapshot: function () { if (values.onQueueSnapshot) { values.onQueueSnapshot(); } return queueSnapshot; },
    moveDrawer: function (direction) { calls.push(['move-drawer', direction]); },
    openDrawer: function () { calls.push(['open-drawer']); },
    closeDrawer: function () { calls.push(['close-drawer']); },
    drawerSnapshot: function () { return queueSnapshot.drawer || { open: false, index: 0 }; },
    pointDrawer: function (index) { calls.push(['point-drawer', index]); },
    activeQueue: function () { return values.activeQueue ? values.activeQueue() : null; },
    activeIndex: function () { return values.activeIndex === undefined ? 0 : values.activeIndex; },
    activatePlaylist: function (ratingKey, index, item, occurrenceId) {
      calls.push(['activate-playlist', ratingKey, index, item, occurrenceId]);
      return values.activatePlaylist ? values.activatePlaylist(ratingKey, index, item, occurrenceId) : null;
    },
    handleKey: function (event, direction) { calls.push(['queue-key', event.keyCode, direction]); return 'queue'; },
    observePlayback: function (position, duration) { calls.push(['observe-playback', position, duration]); },
    resolveAdjacent: function (direction, callback) {
      if (values.resolveAdjacent) { values.resolveAdjacent(direction, callback); }
      else { callback(null); }
    },
    resolveAdjacentState: function (direction, callback) {
      calls.push(['resolve-adjacent-state', direction]);
      if (values.resolveAdjacentState) { return values.resolveAdjacentState(direction, callback); }
      callback(null, { state: 'unavailable' });
      return { state: 'resolving' };
    },
    requestResolved: function (result, options) { calls.push(['request-resolved', result, options]); return true; },
    isConfirmationCurrent: function () { return true; },
    playbackEnded: function (options) { calls.push(['playback-ended', options]); return true; },
    invalidateBackdropLoad: function () {},
    cancelUpNext: function (dismiss) { calls.push(['cancel-up-next', dismiss]); },
    resetPlaybackSession: function () {},
    clear: function () { calls.push(['clear-queue']); },
    startContainer: function (container, callback) {
      calls.push(['start-container', container]);
      return values.startContainer ? values.startContainer(container, callback) : false;
    },
    restoreContainerOrigin: function () {
      calls.push(['restore-container-origin']);
      return values.restoreContainerOrigin ? values.restoreContainerOrigin(captured.queueOptions) : false;
    },
    destroy: function () { destroyed.push('queue'); }
  };
  var playback = {
    snapshot: function () { return { active: true, positionSeconds: 12, durationSeconds: 60, paused: false, subtitleEditor: { open: false }, playback: playbackValue }; },
    diagnostics: function () { return { ratingKey: '42', state: 'playing' }; },
    toggle: function () { calls.push(['toggle']); return true; },
    seekAbsolute: function (seconds, options) { calls.push(['seek', seconds, options && options.source]); return true; },
    close: function (callback) { calls.push(['close']); if (callback) { callback(12, true, '42'); } return true; },
    startAdjacent: function (direction, callback) { calls.push(['legacy-start-adjacent', direction]); if (callback) { callback(null); } return true; },
    startItem: function (item, options, callback) { calls.push(['start-item', item, options]); if (callback) { callback(null); } return true; },
    destroy: function () { destroyed.push('playback'); }
  };
  var controls = {
    snapshot: function () { if (values.onControlsSnapshot) { values.onControlsSnapshot(); } return { mode: 'full', visible: true, zone: 'buttons', buttonIndex: 0, settingIndex: 2, settingsOpen: false, chapter: { open: false }, skip: { visible: false } }; },
    handleKey: function (event, direction) { calls.push(['controls-key', event.keyCode, direction]); return 'controls'; },
    pointerFocus: function (zone, index) { calls.push(['pointer-focus', zone, index]); return true; },
    pointerActivity: function () { calls.push(['pointer-activity']); return true; },
    pointerSeek: function (seconds) { calls.push(['pointer-seek', seconds]); return true; },
    resetSeekRepeat: function () { calls.push(['reset-seek']); },
    holdVisible: function () { calls.push(['hold-visible']); },
    hide: function (manual) { calls.push(['hide-controls', manual]); },
    initializeHidden: function () { calls.push(['initialize-hidden']); },
    cancelControlsTimeout: function () {},
    resumeAutoHide: function () { calls.push(['resume-auto-hide']); },
    updateSkip: function () {},
    resetSkip: function () {},
    resetChapters: function () {},
    reset: function () {},
    setSettingsSignature: function () {},
    resumeSettings: function () {},
    destroy: function () { destroyed.push('controls'); }
  };
  var timerRoot = values.root || { setTimeout: function (fn) { fn(); return 1; }, clearTimeout: function () {} };
  var controller = PlayerFeatureController.create({
    platform: { root: timerRoot, document: documentRef, storage: {} },
    modules: {
      PlaybackQueueController: { create: function (options) { creates.queue += 1; captured.queueOptions = options; return queue; } },
      PlaybackController: { create: function (options) { creates.playback += 1; captured.playbackOptions = options; return playback; } },
      PlayerControlsController: { create: function (options) { creates.controls += 1; captured.controlsOptions = options; return controls; } },
      EpisodeNavigation: { createResolver: function () { return { cancel: function () { calls.push(['resolver-cancel']); } }; }, isRegularSeason: function () { return true; } },
      QueueGapController: values.QueueGapController || QueueGapController,
      ResumeChoice: ResumeChoice,
      QueueGapView: { create: function (options) { creates.gapView += 1; captured.gapViewOptions = options; return { render: function (snapshot, labels) { calls.push(['gap-render', snapshot, labels]); } }; } },
      UpNextView: { create: function (options) { captured.upNextViewOptions = options; return { render: function () {} }; } },
      PlaybackQueueModel: values.PlaybackQueueModel || {
        versionAffinity: function () { return null; },
        containerKind: function (container) { return container && container.containerType || ''; }
      },
      PlayerTimelinePolicy: { formatTime: function (value) { return String(value); }, formatLongTime: function (value) { return String(value); } },
      ChapterState: { create: function () { return { open: false, index: 0 }; } },
      SkipMarkerState: { create: function () { return { visible: false }; } },
      SubtitleEditorView: { create: function () { return { setOpen: function () {}, hideOverlay: function () {} }; } },
      PlayerControlsView: { create: function () { return { renderLoading: function () {} }; } },
      MediaChoiceModel: MediaChoiceModel,
      ProgressiveImages: ProgressiveImages
    },
    data: extend({ config: {}, PlexClient: {}, playbackCapabilities: function () { return {}; }, activeServer: function () { return null; } }, values.data),
    shell: extend({ t: function (key) { return key; }, setText: function () {}, element: function () { return fakeNode(); }, cancelImages: function () {}, stopTheme: function () {} }, values.shell),
    detail: extend({ snapshot: function () { return {}; }, queueSnapshot: function () { return {}; }, preferenceSnapshot: function () { return {}; }, resumeAfterPlayer: function () {}, leave: function () {} }, values.detail),
    library: extend({ restoreContainerOrigin: function () { return false; } }, values.library),
    dialogs: extend({}, values.dialogs),
    settings: extend({ settings: function () { return {}; }, animationDuration: function (delay) { return delay; } }, values.settings),
    diagnostics: extend({ capturePlayback: function () { calls.push(['capture-playback']); } }, values.diagnostics),
    state: extend({
      currentView: function () { return 'player'; },
      setView: function () {},
      enterHome: function () { calls.push(['enter-home']); },
      pointerSelectionActive: function () { return false; }
    }, values.state)
  });
  return {
    controller: controller, creates: creates, destroyed: destroyed, calls: calls,
    queue: queue, playback: playback, controls: controls, captured: captured,
    nodes: nodes, document: documentRef
  };
}


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

(function constructsAndHidesOwnedControllers() {
  var h = createHarness();
  assert.deepStrictEqual(h.creates, { queue: 1, playback: 1, controls: 1, gapView: 1 }, 'the feature must construct each owned controller exactly once');
  Object.keys(h.controller).forEach(function (key) {
    assert.notStrictEqual(h.controller[key], h.queue, 'the queue controller must stay private');
    assert.notStrictEqual(h.controller[key], h.playback, 'the playback controller must stay private');
    assert.notStrictEqual(h.controller[key], h.controls, 'the controls controller must stay private');
  });
  assert.strictEqual(h.controller.playbackSnapshot().active, true);
  assert.strictEqual(h.controller.playbackSnapshot().playback.ratingKey, '42');
  assert.deepStrictEqual(h.controller.playbackDiagnostics(), { ratingKey: '42', state: 'playing' });
  assert.deepStrictEqual(h.controller.snapshot().queue, { playlistQueue: { id: 'queue' }, drawer: { open: false }, destroyed: false });
  assert.strictEqual(h.controller.controlsSnapshot().mode, 'full');
}());


(function featureSnapshotUsesPublishedGapVisibilityWithoutCopyingTheConfirmation() {
  var gapSnapshotReads = 0;
  var stateCallback = null;
  var h = createHarness({
    QueueGapController: {
      create: function (options) {
        stateCallback = options.onState;
        return {
          open: function () { stateCallback({ open: true, focus: 0, confirmation: { token: 'large-gap' } }); return true; },
          invalidate: function () { stateCallback({ open: false, focus: 0, confirmation: null }); return true; },
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
    'the Player hot snapshot must reuse published gap visibility instead of copying the full confirmation');
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

(function upNextItemsExposeArtworkSourceWithoutPreSizing() {
  var posterCalls = [];
  var h = createHarness({ data: { PlexClient: { posterUrl: function () { posterCalls.push(Array.prototype.slice.call(arguments)); return 'unexpected'; } } } });
  var item = h.captured.queueOptions.upNextItem({ item: { ratingKey: 'next', image: '/next.jpg', title: 'Next' } }, 'bottom-panel');
  assert.strictEqual(item.imageSource, '/next.jpg', 'the Up Next view must receive the original artwork source for DOM-sized generation');
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
  assert.deepStrictEqual(h.destroyed, ['controls', 'playback', 'queue'], 'owned controllers must be destroyed once in reverse construction order');
  assert.strictEqual(h.calls.filter(function (entry) { return entry[0] === 'resolver-cancel'; }).length, 0, 'the legacy detail-only episode resolver must not be owned by the player feature');
  assert.strictEqual(h.controller.snapshot().destroyed, true);
  assert.strictEqual(h.controller.handleControlsKey({ keyCode: 13 }, ''), false, 'destroyed features must reject input');
}());

(function rejectedPlaylistDirectStartAlwaysFinishesTransition() {
  var clock = createDeferredClock();
  var playlist = { containerType: 'playlist', containerKey: '/playlists/9/items', title: 'Playlist' };
  var h = createHarness({
    root: clock.root,
    queueSnapshot: { playlistQueue: null, drawer: { open: false }, directPlayPending: false },
    state: { currentView: function () { return 'library'; } },
    library: {
      snapshot: function () { return { library: { zone: 'grid' } }; },
      focusedItem: function () { return playlist; }
    },
    startContainer: function () { return false; }
  });
  assert.strictEqual(h.controller.handleQueueCapture({
    keyCode: 415,
    preventDefault: function () {},
    stopImmediatePropagation: function () {}
  }), true);
  assert.strictEqual(clock.pending(), 1, 'a rejected direct start must schedule transition cleanup');
  clock.runAll();
  assert.strictEqual(/is-container-direct-start/.test(h.document.body.className), false, 'a rejected direct start must not leave the transition class behind');
}());

(function playStartsCollectionContainerQueueFromLibrary() {
  var collection = {
    containerType: 'collection',
    containerKey: '/library/collections/7/children',
    ratingKey: '7',
    title: 'Collection'
  };
  var h = createHarness({
    queueSnapshot: { playlistQueue: null, drawer: { open: false }, directPlayPending: false },
    state: { currentView: function () { return 'library'; } },
    library: {
      snapshot: function () { return { library: { zone: 'grid' } }; },
      focusedItem: function () { return collection; },
      activeContainer: function () { return null; }
    },
    startContainer: function (container) {
      assert.strictEqual(container, collection, 'collection playback must preserve the focused container');
      return true;
    }
  });
  assert.strictEqual(h.controller.handleQueueCapture({
    keyCode: 415,
    preventDefault: function () {},
    stopImmediatePropagation: function () {}
  }), true, 'Play on a collection must start its generic playback queue');
  assert.strictEqual(h.calls.filter(function (entry) { return entry[0] === 'start-container'; }).length, 1);
}());

(function failedPlaylistDirectStartAlwaysFinishesTransition() {
  var clock = createDeferredClock();
  var playlist = { containerType: 'playlist', containerKey: '/playlists/9/items', title: 'Playlist' };
  var h = createHarness({
    root: clock.root,
    queueSnapshot: { playlistQueue: null, drawer: { open: false }, directPlayPending: false },
    state: { currentView: function () { return 'library'; } },
    library: {
      snapshot: function () { return { library: { zone: 'grid' } }; },
      focusedItem: function () { return playlist; },
      restoreContainerOrigin: function () { return false; }
    },
    startContainer: function (container, callback) { callback(new Error('unavailable')); return true; },
    restoreContainerOrigin: function (options) {
      options.onRestoreOrigin({ kind: 'playlist', key: '9' });
      return true;
    }
  });
  assert.strictEqual(h.controller.handleQueueCapture({
    keyCode: 415,
    preventDefault: function () {},
    stopImmediatePropagation: function () {}
  }), true);
  assert.ok(/is-container-direct-start/.test(h.document.body.className), 'failed direct playback must keep the transition until deferred cleanup');
  assert.strictEqual(clock.pending(), 1, 'failed direct playback must schedule exactly one transition cleanup');
  clock.runAll();
  assert.strictEqual(/is-container-direct-start/.test(h.document.body.className), false, 'failed direct playback must always remove the transition class');
}());

(function cancelledPlaylistDirectStartAlwaysFinishesTransition() {
  var clock = createDeferredClock();
  var h = createHarness({
    root: clock.root,
    queueSnapshot: { playlistQueue: null, drawer: { open: false }, directPlayPending: true },
    state: { currentView: function () { return 'library'; } },
    library: { restoreContainerOrigin: function () { return false; } },
    restoreContainerOrigin: function (options) {
      options.onRestoreOrigin({ kind: 'playlist', key: '9' });
      return true;
    }
  });
  h.document.body.className = 'app is-container-direct-start';
  assert.strictEqual(h.controller.handleQueueCapture({
    keyCode: 461,
    preventDefault: function () {},
    stopImmediatePropagation: function () {}
  }), true);
  assert.strictEqual(clock.pending(), 1, 'Back during direct playback must schedule exactly one transition cleanup');
  clock.runAll();
  assert.strictEqual(/is-container-direct-start/.test(h.document.body.className), false, 'Back must remove the direct-play transition even when origin presentation cannot be restored');
}());

(function teardownCancelsDeferredPlaylistOriginTransition() {
  var clock = createDeferredClock();
  var h = createHarness({
    root: clock.root,
    queueSnapshot: {
      playlistQueue: { items: [{ ratingKey: '42' }], index: 0 },
      containerOrigin: { kind: 'playlist', key: '9' },
      drawer: { open: false }
    },
    library: { restoreContainerOrigin: function () { return true; } },
    detail: { leave: function () {} }
  });
  h.document.body.className = 'app is-container-direct-start';
  assert.strictEqual(h.captured.queueOptions.onRestoreOrigin({ kind: 'playlist', key: '9' }), true);
  assert.strictEqual(clock.pending(), 1, 'restoring a playlist origin must defer removal of the transition class');
  h.controller.destroy();
  assert.strictEqual(clock.pending(), 0, 'destroy must cancel every feature-owned deferred callback');
  clock.runAll();
  assert.ok(/is-container-direct-start/.test(h.document.body.className), 'cancelled transition work must not mutate the DOM after destroy');
}());

(function latePlaybackCallbacksAreIgnoredAfterDestroy() {
  var h = createHarness({
    detail: {
      applyLocalPlaybackProgress: function () { h.calls.push(['late-progress']); },
      refreshPlaybackState: function () { h.calls.push(['late-refresh']); }
    },
    state: { setPlaybackIdentity: function () { h.calls.push(['late-identity']); } }
  });
  h.controller.destroy();
  h.captured.playbackOptions.onClosed(20, true, '42');
  assert.strictEqual(h.calls.some(function (entry) { return /^late-/.test(entry[0]); }), false, 'late stopped-report callbacks must not mutate feature state after destroy');
}());



(function closingPlayerInvalidatesPendingQueueGapConfirmation() {
  var h = createHarness({ diagnostics: { capturePlayback: function () {} } });
  var confirmation = {
    token: 'gap-close-player',
    kind: 'episode',
    generation: 1,
    target: { state: 'available', occurrenceId: 'series:1:3', item: { ratingKey: 's1e3' }, index: 2 }
  };
  h.captured.queueOptions.onGapRequired(confirmation, 'manual');
  assert.strictEqual(h.controller.snapshot().queueGapOpen, true);
  h.captured.controlsOptions.closePlayer();
  assert.strictEqual(h.controller.snapshot().queueGapOpen, false,
    'closing Player must invalidate a pending queue-gap confirmation');
  h.controller.handleQueueGapKey({ keyCode: 13, preventDefault: function () {} }, '');
  assert.strictEqual(h.calls.some(function (entry) { return entry[0] === 'request-resolved'; }), false,
    'a closed Player must not allow the stale confirmation to start playback');
}());

(function playlistReturnKeepsTheTransitionUntilTheRealContainerIsReady() {
  var clock = createDeferredClock();
  var restoreOptions = null;
  var current = { ratingKey: 's2e1', type: 'episode', seasonIndex: 2, episodeIndex: 1 };
  var h = createHarness({
    root: clock.root,
    diagnostics: { capturePlayback: function () {} },
    queueSnapshot: {
      playlistQueue: { items: [current], index: 12, currentItem: current },
      containerOrigin: { ratingKey: 'playlist-1', containerKey: '/playlists/playlist-1/items', containerType: 'playlist' },
      drawer: { open: false }
    },
    library: {
      restoreContainerOrigin: function (options) { restoreOptions = options; return true; }
    }
  });
  h.captured.controlsOptions.closePlayer();
  assert.strictEqual(restoreOptions.activeItem.ratingKey, 's2e1', 'playlist return passes the active occurrence independently of the resident queue page');
  assert.strictEqual(typeof restoreOptions.onReady, 'function', 'playlist return waits for the normal container lifecycle to finish');
  assert.ok(/is-container-origin-restoring/.test(h.document.body.className), 'playlist return keeps a transition surface visible while Plex reloads the container');
  restoreOptions.onReady(true);
  assert.strictEqual(clock.pending(), 1, 'the completed playlist load schedules one transition cleanup');
  clock.runAll();
  assert.strictEqual(/is-container-origin-restoring/.test(h.document.body.className), false, 'playlist return reveals the complete container after the transition');
}());

(function collectionReturnRestoresTheContainerAndCurrentOccurrence() {
  var restoreOptions = null;
  var detailLeft = 0;
  var current = { ratingKey: 'movie-2', type: 'movie', title: 'Second' };
  var h = createHarness({
    diagnostics: { capturePlayback: function () {} },
    queueSnapshot: {
      playlistQueue: { items: [current], index: 1, currentItem: current },
      containerOrigin: {
        ratingKey: 'collection-1',
        containerKey: '/library/collections/collection-1/children',
        containerType: 'collection',
        title: 'Saga'
      },
      drawer: { open: false }
    },
    library: {
      restoreContainerOrigin: function (options) { restoreOptions = options; return true; }
    },
    detail: { leave: function () { detailLeft += 1; } }
  });
  h.captured.controlsOptions.closePlayer();
  assert.strictEqual(restoreOptions.origin.containerType, 'collection',
    'Back from collection playback must preserve the collection origin');
  assert.strictEqual(restoreOptions.activeItem.ratingKey, 'movie-2',
    'Back from collection playback must restore focus to the playing occurrence');
  assert.strictEqual(detailLeft, 1,
    'a restored collection must discard the hidden playback detail instead of revealing it');
}());

(function stalePlaylistReturnCannotRevealANewerRestore() {
  var clock = createDeferredClock();
  var restoreOptions = [];
  var current = { ratingKey: 'episode-1', type: 'episode' };
  var h = createHarness({
    root: clock.root,
    diagnostics: { capturePlayback: function () {} },
    queueSnapshot: {
      playlistQueue: { items: [current], index: 0, currentItem: current },
      containerOrigin: { ratingKey: 'playlist-1', containerKey: '/playlists/playlist-1/items', containerType: 'playlist' },
      drawer: { open: false }
    },
    library: {
      restoreContainerOrigin: function (options) { restoreOptions.push(options); return true; }
    }
  });
  h.captured.controlsOptions.closePlayer();
  h.captured.controlsOptions.closePlayer();
  restoreOptions[0].onReady(false);
  assert.strictEqual(clock.pending(), 0, 'a stale playlist load cannot schedule removal of a newer restore transition');
  restoreOptions[1].onReady(true);
  assert.strictEqual(clock.pending(), 1, 'only the current playlist load owns transition cleanup');
}());

(function newerPlaybackInvalidatesPendingAdjacentMetadata() {
  var metadataCallback = null;
  var delivered = false;
  var h = createHarness({
    resolveAdjacent: function (direction, callback) {
      callback({ item: { ratingKey: '99' }, index: 1, queue: { kind: 'series' } });
    },
    data: {
      PlexClient: {
        loadMetadata: function (config, ratingKey, callback) {
          assert.strictEqual(ratingKey, '99');
          metadataCallback = callback;
          return { abort: function () {} };
        }
      }
    }
  });
  h.captured.playbackOptions.resolveAdjacent(1, function () { delivered = true; });
  assert.strictEqual(typeof metadataCallback, 'function', 'adjacent playback must request metadata for the selected queue item');
  h.captured.playbackOptions.onOpening();
  metadataCallback(null, { ratingKey: '99' });
  assert.strictEqual(delivered, false, 'a newer playback opening must invalidate older adjacent metadata callbacks');
}());



(function paginatedContainerPlaybackPreservesTheExactOccurrence() {
  var current = { ratingKey: 'current', type: 'movie', title: 'Current' };
  var target = { ratingKey: 'target', type: 'movie', title: 'Target' };
  var queue = { kind: 'container', title: 'Large queue', items: [current], index: 0 };
  var context = { playlistQueue: true, queueAbsoluteIndex: 250, queueTotal: 1000, episodes: [target], seasons: [{ ratingKey: 'playlist', index: 1 }] };
  var applied = [];
  var h = createHarness({
    activeQueue: function () { return queue; },
    activatePlaylist: function (ratingKey, index, item, occurrenceId) {
      assert.strictEqual(ratingKey, 'target');
      assert.strictEqual(index, 250);
      assert.strictEqual(item, target, 'the resolved non-resident record must reach queue activation');
      assert.strictEqual(occurrenceId, 'playlist:250:target');
      return { queue: queue, context: context, index: 0, absoluteIndex: 250 };
    },
    detail: {
      snapshot: function () { return { currentDetail: current, seriesContext: { playlistQueue: true, queueAbsoluteIndex: 0 }, episodeIndex: 0 }; },
      queueSnapshot: function () { return { currentDetail: current, seriesContext: { playlistQueue: true, queueAbsoluteIndex: 0 }, episodeIndex: 0 }; },
      preferenceSnapshot: function () { return {}; },
      setPlaybackContext: function (detail, item, nextContext, seasonIndex, episodeIndex) {
        applied.push({ detail: detail, item: item, context: nextContext, seasonIndex: seasonIndex, episodeIndex: episodeIndex });
      },
      queueMediaProfile: function () {},
      renderEpisodeContext: function () {},
      playbackPreferences: function () { return {}; }
    }
  });
  assert.strictEqual(h.captured.queueOptions.requestPlayback({
    origin: 'queue', item: target, detail: { ratingKey: 'target', type: 'movie' }, queue: queue,
    index: 250, occurrenceId: 'playlist:250:target', versionAffinity: { codec: 'hevc' }
  }), true);
  assert.strictEqual(applied.length, 1);
  assert.strictEqual(applied[0].context.queueAbsoluteIndex, 250);
  assert.strictEqual(applied[0].episodeIndex, 0, 'the bounded local episode context must use its local index');
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'start-item' && entry[1] === target; }),
    'the exact resolved occurrence must reach PlaybackController without changing its API');
}());

(function adjacentSeriesPlaybackPreservesTheSeriesQueueContext() {
  var first = { ratingKey: 's1e1', type: 'episode', title: 'Episode 1', seasonIndex: 1, episodeIndex: 1 };
  var second = {
    ratingKey: 's1e2', type: 'episode', title: 'Episode 2', seasonIndex: 1, episodeIndex: 2,
    queueSeasonIndex: 0, queueEpisodeIndex: 1, queueEpisodes: [first]
  };
  second.queueEpisodes.push(second);
  var seasons = [{ ratingKey: 'season-1', index: 1, title: 'Season 1' }];
  var seriesContext = { seasons: seasons, episodes: [first, second], playlistQueue: false, type: 'show' };
  var applied = [];
  var queue = { kind: 'series', title: 'Example Show', items: [first, second], index: 0 };
  var h = createHarness({
    PlaybackQueueModel: PlaybackQueueModel,
    detail: {
      snapshot: function () {
        return { currentDetail: first, seriesContext: seriesContext, seasonIndex: 0, episodeIndex: 0 };
      },
      queueSnapshot: function () {
        return { currentDetail: first, seriesContext: seriesContext, seasonIndex: 0, episodeIndex: 0 };
      },
      preferenceSnapshot: function () { return {}; },
      setPlaybackContext: function (detail, item, nextContext, seasonIndex, episodeIndex) {
        applied.push({ detail: detail, item: item, context: nextContext, seasonIndex: seasonIndex, episodeIndex: episodeIndex });
      },
      queueMediaProfile: function () {},
      renderEpisodeContext: function () {}
    }
  });
  h.captured.playbackOptions.onAdjacentStarted({
    detail: { ratingKey: 's1e2', type: 'episode' },
    item: second,
    queueTarget: { queue: queue, item: second, index: 1 }
  });
  assert.strictEqual(applied.length, 1);
  assert.strictEqual(applied[0].context.playlistQueue, false,
    'series Previous/Next must not turn the active detail context into a playlist queue');
  assert.strictEqual(applied[0].context.seasons, seasons,
    'series Previous/Next must retain the real season catalog used by the drawer provider');
  assert.deepStrictEqual(applied[0].context.episodes, [first, second]);
  assert.strictEqual(applied[0].seasonIndex, 0);
  assert.strictEqual(applied[0].episodeIndex, 1);
}());


(function manualAdjacentGapRequiresExplicitConfirmation() {
  var target = { state: 'available', occurrenceId: 'series:4:3', item: { ratingKey: 's4e3', title: 'Episode 3' }, index: 0 };
  var confirmation = {
    token: 'gap-1', kind: 'combined', target: target,
    missingSeasons: { from: 3, to: 3 }, missingEpisodes: { season: 4, from: 1, to: 2 }
  };
  var h = createHarness({
    resolveAdjacentState: function (_direction, callback) {
      callback(null, { state: 'confirmation-required', confirmation: confirmation });
      return { state: 'resolving' };
    }
  });
  h.captured.controlsOptions.startAdjacent(1);
  assert.strictEqual(h.controller.snapshot().queueGapOpen, true, 'manual Next must open the queue-gap confirmation');
  assert.strictEqual(h.calls.some(function (entry) { return entry[0] === 'legacy-start-adjacent'; }), false,
    'manual gap resolution must not invoke PlaybackController.startAdjacent');
  assert.strictEqual(h.calls.some(function (entry) { return entry[0] === 'request-resolved'; }), false,
    'resolving a gap must not start playback before confirmation');
  h.controller.handleQueueGapKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  h.controller.handleQueueGapKey({ keyCode: 13, preventDefault: function () {} }, '');
  assert.strictEqual(h.controller.snapshot().queueGapOpen, false);
  assert.strictEqual(h.calls.filter(function (entry) { return entry[0] === 'request-resolved'; }).length, 1,
    'confirming the modal must send the already-resolved target to the queue controller exactly once');
}());


(function openQueueGapBlocksFurtherAdjacentResolution() {
  var resolutions = 0;
  var confirmation = {
    token: 'gap-blocking', kind: 'episode', generation: 1,
    target: { state: 'available', occurrenceId: 'series:1:3', item: { ratingKey: 's1e3' }, index: 2 }
  };
  var h = createHarness({
    resolveAdjacentState: function (_direction, callback) {
      resolutions += 1;
      callback(null, { state: 'unavailable' });
      return { state: 'unavailable' };
    }
  });
  h.captured.queueOptions.onGapRequired(confirmation, 'manual');
  assert.strictEqual(h.controller.snapshot().queueGapOpen, true);
  h.captured.controlsOptions.startAdjacent(1);
  assert.strictEqual(resolutions, 0,
    'an open confirmation must block new adjacent provider requests at the Player boundary');
  h.captured.playbackOptions.onEnded();
  assert.strictEqual(resolutions, 0,
    'a repeated playback-ended notification must not start a second Up Next resolution behind the modal');
}());

(function duplicateGapNotificationsPreserveTheOpeningOwner() {
  var confirmation = {
    token: 'gap-owner', kind: 'episode', generation: 1,
    target: { state: 'available', occurrenceId: 'series:1:3', item: { ratingKey: 's1e3' }, index: 2 }
  };
  var h = createHarness();
  h.captured.queueOptions.onGapRequired(confirmation, 'manual');
  h.captured.queueOptions.onGapRequired(confirmation, 'up-next');
  h.controller.handleQueueGapKey({ keyCode: 461, preventDefault: function () {} }, '');
  assert.strictEqual(h.calls.some(function (entry) {
    return entry[0] === 'cancel-up-next';
  }), false, 'a rejected duplicate notification must not steal ownership from the open manual gap');
}());

(function laterGapResultsCannotReplaceTheVisibleDecision() {
  var first = {
    token: 'gap-first', kind: 'episode', generation: 1,
    target: { state: 'available', occurrenceId: 'series:1:3', item: { ratingKey: 's1e3' }, index: 2 }
  };
  var later = {
    token: 'gap-later', kind: 'episode', generation: 1,
    target: { state: 'available', occurrenceId: 'series:1:0', item: { ratingKey: 's1e0' }, index: 0 }
  };
  var h = createHarness();
  h.captured.queueOptions.onGapRequired(first, 'manual');
  h.captured.queueOptions.onGapRequired(later, 'manual');
  h.controller.handleQueueGapKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  h.controller.handleQueueGapKey({ keyCode: 13, preventDefault: function () {} }, '');
  assert.strictEqual(h.calls.filter(function (entry) { return entry[0] === 'request-resolved'; })[0][1].occurrenceId,
    first.target.occurrenceId, 'a late adjacent result must not replace the decision already shown to the user');
}());

(function queueReplacementImmediatelyInvalidatesTheVisibleGap() {
  var confirmation = {
    token: 'gap-queue-replaced', kind: 'episode', generation: 1,
    target: { state: 'available', occurrenceId: 'series:1:3', item: { ratingKey: 's1e3' }, index: 2 }
  };
  var h = createHarness();
  h.captured.queueOptions.onGapRequired(confirmation, 'manual');
  assert.strictEqual(h.controller.snapshot().queueGapOpen, true);
  h.captured.queueOptions.onQueueChanged();
  assert.strictEqual(h.controller.snapshot().queueGapOpen, false,
    'replacing the logical queue must dismiss a stale confirmation immediately');
  assert.strictEqual(h.controller.handleQueueGapKey({ keyCode: 13, preventDefault: function () {} }, ''), false);
}());


(function upNextGapUsesTheSameConfirmationSurface() {
  var h = createHarness();
  var confirmation = {
    token: 'gap-up-next', kind: 'season',
    target: { state: 'available', occurrenceId: 'series:4:1', item: { ratingKey: 's4e1', title: 'Episode 1' }, index: 0 },
    missingSeasons: { from: 3, to: 3 }
  };
  h.captured.queueOptions.onGapRequired(confirmation, 'up-next');
  assert.strictEqual(h.controller.snapshot().queueGapOpen, true, 'Up Next must reuse the generic queue-gap modal');
  h.controller.handleQueueGapKey({ keyCode: 461, preventDefault: function () {} }, '');
  assert.strictEqual(h.controller.snapshot().queueGapOpen, false);
}());

console.log('Player feature controller checks passed');
