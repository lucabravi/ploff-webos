'use strict';

var MediaChoiceModel = require('../../app/media-choice-model');
var InputCommandRouter = require('../../app/coordinator/input-command-router');
var PlayerFeatureController = require('../../app/coordinator/player-feature-controller');
var PlayerSubtitleEditorController = require('../../app/coordinator/player-subtitle-editor-controller');
var QueueGapController = require('../../app/coordinator/queue-gap-controller');
var ResumeChoice = require('../../app/resume-choice');
var ProgressiveImages = require('../../app/progressive-images');
var SubtitleSync = require('../../app/subtitle-sync');
var SubtitleSeriesOffset = require('../../app/subtitle-series-offset');
var AssSubtitlePrefetchPolicy = require('../../app/ass-subtitle-prefetch-policy');
var PlexSourceRouter = require('../../app/coordinator/plex-source-router');
var MediaSourceResolver = require('../../app/coordinator/media-source-resolver');

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
    focusCount: 0,
    focus: function () { this.focusCount += 1; },
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
  var creates = { queue: 0, playerQueue: 0, playback: 0, controls: 0, subtitleEditor: 0, gapView: 0 };
  var destroyed = [];
  var calls = [];
  var controlsSettingsOpen = values.controlsSettingsOpen === true;
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
  if (values.playbackValue) { playbackValue = values.playbackValue; }
  var subtitleEditorState = values.subtitleEditorState || { open: false };
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
    resolveAdjacentState: function (direction, callback) {
      calls.push(['resolve-adjacent-state', direction]);
      if (values.resolveAdjacentState) { return values.resolveAdjacentState(direction, callback); }
      callback(null, { state: 'unavailable' });
      return { state: 'resolving' };
    },
    waitForDetail: function (itemOrRatingKey, callback) {
      calls.push(['wait-for-detail', itemOrRatingKey]);
      if (values.waitForDetail) { return values.waitForDetail(itemOrRatingKey, callback); }
      if (captured.queueOptions && typeof captured.queueOptions.loadMetadata === 'function') {
        return captured.queueOptions.loadMetadata(itemOrRatingKey, callback);
      }
      callback(new Error('metadata unavailable'));
      return null;
    },
    claimBackdropPrefetch: function (key) {
      calls.push(['claim-backdrop-prefetch', key]);
      return values.claimBackdropPrefetch ? values.claimBackdropPrefetch(key) : true;
    },
    requestResolved: function (result, options) { calls.push(['request-resolved', result, options]); return true; },
    isConfirmationCurrent: function () { return true; },
    playbackEnded: function (options) { calls.push(['playback-ended', options]); return true; },
    invalidateBackdropLoad: function () {},
    cancelUpNext: function (dismiss) { calls.push(['cancel-up-next', dismiss]); },
    resetPlaybackSession: function () {},
    cancelPendingPlayback: function () { calls.push(['cancel-pending-playback']); },
    completeDirect: function () {},
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
  var playerQueue = {
    label: function () { return 'Queue'; },
    ensureUi: function () { return true; },
    updateButton: function () { return true; },
    updatePresentation: function () {
      var snapshot = queue.snapshot();
      if (snapshot && snapshot.drawer && snapshot.drawer.open) { playerQueue.renderDrawerState(snapshot.drawer); }
      return true;
    },
    renderDrawerState: function (snapshot) {
      if (snapshot && snapshot.open && captured.playerQueueOptions && captured.playerQueueOptions.detailSnapshot) {
        captured.playerQueueOptions.detailSnapshot();
      }
      return true;
    },
    open: function () { queue.openDrawer(); return true; },
    close: function () { queue.closeDrawer(); return true; },
    move: function (direction) { queue.moveDrawer(direction); return true; },
    pointerFocus: function (button) {
      var index = button && button.getAttribute ? Number(button.getAttribute('data-playlist-queue-index')) : NaN;
      var snapshot = queue.snapshot();
      if (!snapshot || !snapshot.drawer || !snapshot.drawer.open || !isFinite(index)) { return false; }
      if (captured.playerQueueOptions && captured.playerQueueOptions.detailSnapshot) { captured.playerQueueOptions.detailSnapshot(); }
      queue.pointDrawer(index);
      return true;
    },
    resetPresentation: function () {},
    resetPlaybackState: function () {},
    updatePlaybackMarkers: function () {},
    destroy: function () { destroyed.push('player-queue'); }
  };
  var playback = {
    snapshot: function () {
      if (values.playbackSnapshot) { return values.playbackSnapshot(playbackValue, subtitleEditorState); }
      return { active: true, positionSeconds: 12, durationSeconds: 60, paused: false, subtitleEditor: subtitleEditorState, playback: playbackValue };
    },
    diagnostics: function () { return { ratingKey: '42', state: 'playing' }; },
    subtitleEditorAvailability: function (streamId) {
      var explicit = arguments.length > 0;
      var tracks = playbackValue.subtitleTracks || [];
      var selectedId = explicit ? String(streamId || '') : String(playbackValue.options && playbackValue.options.subtitleStreamID || '');
      var index;
      if (values.subtitleEditorAvailability) { return values.subtitleEditorAvailability(streamId, explicit, playbackValue); }
      if (!selectedId && !explicit) { return { enabled: tracks.length > 0, reason: tracks.length ? '' : 'unsupported' }; }
      for (index = 0; index < tracks.length; index += 1) {
        if (String(tracks[index].id || '') === selectedId) { return { enabled: true, reason: '' }; }
      }
      return { enabled: false, reason: 'unsupported' };
    },
    toggle: function () { calls.push(['toggle']); return true; },
    changeTrack: function (kind, options) {
      calls.push(['change-track', kind, options && options.id]);
      if (kind === 'subtitles') { playbackValue.options.subtitleStreamID = String(options && options.id || ''); }
      else if (kind === 'audio') { playbackValue.options.audioStreamID = String(options && options.id || ''); }
      return true;
    },
    changeVersion: function (options, callback) {
      calls.push(['change-version', options]);
      if (options && options.subtitleSize !== undefined) { playbackValue.options.subtitleSize = Number(options.subtitleSize); }
      if (callback) { callback(null); }
      return true;
    },
    seekAbsolute: function (seconds, options) { calls.push(['seek', seconds, options && options.source]); return true; },
    openSubtitleEditor: function (options) {
      calls.push(['open-subtitle-editor', options || null]);
      if (values.openSubtitleEditor) { return values.openSubtitleEditor(options, playbackValue, subtitleEditorState); }
      subtitleEditorState.open = true;
      subtitleEditorState.selectedStreamID = options && options.action === 'set-track' ? String(options.streamId || '') : String(subtitleEditorState.selectedStreamID || playbackValue.options.subtitleStreamID || '');
      subtitleEditorState.subtitleSize = Number(subtitleEditorState.subtitleSize || playbackValue.options.subtitleSize || 100);
      subtitleEditorState.offsetMs = Number(subtitleEditorState.offsetMs || 0);
      subtitleEditorState.status = '';
      subtitleEditorState.applying = false;
      return true;
    },
    applySubtitleEditor: function (options, callback) {
      calls.push(['apply-subtitle-editor']);
      subtitleEditorState.open = false;
      if (values.applySubtitleEditor) { return values.applySubtitleEditor(options, callback, playbackValue, subtitleEditorState); }
      if (callback) { callback(null); }
      return true;
    },
    cancelSubtitleEditor: function (callback) {
      calls.push(['cancel-subtitle-editor']);
      subtitleEditorState.open = false;
      if (values.cancelSubtitleEditor) { return values.cancelSubtitleEditor(callback, playbackValue, subtitleEditorState); }
      if (callback) { callback(null); }
      return true;
    },
    open: function (request, callback) { calls.push(['open-playback', request]); if (callback) { callback(null); } return true; },
    close: function (callback) { calls.push(['close']); if (callback) { callback(12, true, '42'); } return true; },
    startItem: function (item, options, callback) { calls.push(['start-item', item, options]); if (callback) { callback(null); } return true; },
    destroy: function () { destroyed.push('playback'); }
  };
  var controls = {
    snapshot: function () { if (values.onControlsSnapshot) { values.onControlsSnapshot(); } return { mode: 'full', visible: true, zone: 'buttons', buttonIndex: 0, settingIndex: 2, settingsOpen: controlsSettingsOpen, chapter: { open: false }, skip: { visible: false } }; },
    handleKey: function (event, direction) { calls.push(['controls-key', event.keyCode, direction]); return 'controls'; },
    pointerFocus: function (zone, index) { calls.push(['pointer-focus', zone, index]); return true; },
    pointerActivity: function () { calls.push(['pointer-activity']); return true; },
    pointerSeek: function (seconds) { calls.push(['pointer-seek', seconds]); return true; },
    setZone: function (zone, index) { calls.push(['set-zone', zone, index]); },
    resetSeekRepeat: function () { calls.push(['reset-seek']); },
    holdVisible: function () { calls.push(['hold-visible']); },
    hide: function (manual) { calls.push(['hide-controls', manual]); },
    initializeHidden: function () { calls.push(['initialize-hidden']); },
    cancelControlsTimeout: function () {},
    resumeAutoHide: function () { calls.push(['resume-auto-hide']); },
    updateSkip: function () {},
    resetSkip: function () {},
    resetChapters: function () {},
    closeChapters: function (restoreFocus) { calls.push(['controls-close-chapters', restoreFocus]); },
    chapterHintVisible: function () { return false; },
    reset: function () {},
    setSettingsSignature: function () {},
    resumeSettings: function () { controlsSettingsOpen = true; },
    destroy: function () { destroyed.push('controls'); }
  };
  var timerRoot = values.root || { setTimeout: function (fn) { fn(); return 1; }, clearTimeout: function () {} };
  timerRoot.PloffAssSubtitlePrefetchPolicy = values.AssSubtitlePrefetchPolicy || AssSubtitlePrefetchPolicy;
  var routerConfig = values.data && values.data.config || {};
  var sourceRouter = values.data && values.data.sourceRouter || PlexSourceRouter.create({
    config: routerConfig,
    sources: {
      primaryContext: function () { return { apiBaseUrl: routerConfig.apiBaseUrl || '', token: routerConfig.token || '', requestTimeout: routerConfig.requestTimeout }; },
      contextForMachine: function () { return null; }
    }
  });
  var featureOptions = {
    platform: { root: timerRoot, document: documentRef, storage: values.storage || {} },
    modules: {
      PlaybackQueueController: { create: function (options) { creates.queue += 1; captured.queueOptions = options; return queue; } },
      PlayerQueueController: { create: function (options) { creates.playerQueue += 1; captured.playerQueueOptions = options; return playerQueue; } },
      InputCommandRouter: values.InputCommandRouter || InputCommandRouter,
      PlaybackController: { create: function (options) { creates.playback += 1; captured.playbackOptions = options; return playback; } },
      NativeVideoDriver: values.NativeVideoDriver || { create: function () {} },
      PlaybackReposition: values.PlaybackReposition || { create: function () {} },
      PlaybackSession: values.PlaybackSession || { create: function () {} },
      PlaybackOperation: require('../../app/playback-operation'),
      PlaybackTimeline: values.PlaybackTimeline || { create: function () {} },
      SubtitleRuntime: values.SubtitleRuntime || { create: function () {} },
      PlayerControlsController: { create: function (options) { creates.controls += 1; captured.controlsOptions = options; return controls; } },
      PlayerSubtitleEditorController: values.PlayerSubtitleEditorController || { create: function (options) {
        var owner;
        var originalDestroy;
        creates.subtitleEditor += 1;
        captured.subtitleEditorOptions = options;
        owner = PlayerSubtitleEditorController.create(options);
        originalDestroy = owner.destroy;
        owner.destroy = function () { destroyed.push('subtitle-editor'); originalDestroy(); };
        return owner;
      } },
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
      SubtitleSync: values.SubtitleSync || SubtitleSync,
      SubtitleSeriesOffset: values.SubtitleSeriesOffset || SubtitleSeriesOffset,
      SubtitleEditorView: values.SubtitleEditorView || { create: function () { return { setOpen: function () {}, hideOverlay: function () {}, render: function () {}, controls: function () { return []; } }; } },
      PlayerControlsView: { create: function () { return {
        renderLoading: function (loading, preserveFrame) { calls.push(['player-loading', loading, preserveFrame]); },
        renderEpisodeCommands: function (previous, next) { calls.push(['episode-commands', previous, next]); },
        renderProgress: function () {}
      }; } },
      PlayerChaptersView: { create: function () { return {
        renderHint: function () {}, updateFocus: function () {}, render: function () {}, close: function () {}, reset: function () {}
      }; } },
      MediaInfo: values.MediaInfo || { selectedTrack: function (tracks, id) { return (tracks || []).filter(function (track) { return String(track.id || '') === String(id || ''); })[0] || null; } },
      MediaProfile: { trackDisplayLabel: function () { return ''; }, detailedSize: function () { return ''; } },
      MediaChoiceModel: MediaChoiceModel,
      VersionSelection: values.VersionSelection,
      ProgressiveImages: ProgressiveImages
    },
    data: extend({ config: {}, sourceRouter: sourceRouter, sourceResolver: MediaSourceResolver.create({ sourceRouter: sourceRouter }), PlexClient: {}, playbackCapabilities: function () { return {}; }, activeServer: function () { return null; } }, values.data),
    shell: extend({ t: function (key) { return key; }, setText: function () {}, element: function () { return fakeNode(); }, cancelImages: function () {}, stopTheme: function () {}, posterLoader: function () { return null; } }, values.shell),
    detail: extend({ snapshot: function () { return {}; }, queueSnapshot: function () { return {}; }, preferenceSnapshot: function () { return {}; }, resumeAfterPlayer: function () {}, leave: function () {} }, values.detail),
    library: extend({ restoreContainerOrigin: function () { return false; } }, values.library),
    dialogs: extend({}, values.dialogs),
    settings: extend({
      settings: function () { return {}; },
      animationDuration: function (delay) { return delay; },
      videoQualityLabel: function (value) { return value; },
      playbackPreferenceLabel: function (value) { return value; },
      connectionRouteLabel: function () { return ''; }
    }, values.settings),
    diagnostics: extend({ capturePlayback: function () { calls.push(['capture-playback']); }, error: function () { return ''; }, setError: function () {} }, values.diagnostics),
    state: extend({
      currentView: function () { return 'player'; },
      setView: function () {},
      enterDetail: function () { calls.push(['enter-detail']); },
      enterHome: function () { calls.push(['enter-home']); },
      pointerSelectionActive: function () { return false; }
    }, values.state)
  };
  if (values.prepare) { values.prepare(featureOptions, {
    creates: creates, destroyed: destroyed, calls: calls, nodes: nodes,
    queue: queue, playerQueue: playerQueue, playback: playback, controls: controls, document: documentRef
  }); }
  var controller = (values.createFeature || PlayerFeatureController.create)(featureOptions);
  return {
    controller: controller, creates: creates, destroyed: destroyed, calls: calls,
    queue: queue, playerQueue: playerQueue, playback: playback, controls: controls, captured: captured,
    nodes: nodes, document: documentRef,
    setControlsSettingsOpen: function (open) { controlsSettingsOpen = open === true; }
  };
}



module.exports = {
  fakeNode: fakeNode,
  createDeferredClock: createDeferredClock,
  createHarness: createHarness
};
