(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffPlayerFeatureController = factory(); }
}(this, function () {
  'use strict';

  var SUBTITLE_AUTOMATIC_VALUE = '__automatic__';
  var SUBTITLE_OFF_VALUE = '__off__';

  function create(options) {
    var values = options || {};
    var platform = values.platform || {};
    var root = platform.root || {};
    var document = platform.document || {};
    var storage = platform.storage;
    var modules = values.modules || {};
    var dataPorts = values.data || {};
    var shellPorts = values.shell || {};
    var detailPorts = values.detail || {};
    var libraryPorts = values.library || {};
    var dialogsPorts = values.dialogs || {};
    var settingsPorts = values.settings || {};
    var diagnosticsPorts = values.diagnostics || {};
    var statePorts = values.state || {};
    var PlexClient = dataPorts.PlexClient;
    var config = dataPorts.config || {};
    var PlaybackQueueController = modules.PlaybackQueueController;
    var QueueSequenceContract = modules.QueueSequenceContract;
    var BoundedQueueCache = modules.BoundedQueueCache;
    var SeriesQueueProvider = modules.SeriesQueueProvider;
    var PlexContainerQueueProvider = modules.PlexContainerQueueProvider;
    var QueueGapController = modules.QueueGapController;
    var QueueGapView = modules.QueueGapView;
    var PlaybackController = modules.PlaybackController;
    var NativeVideoDriver = modules.NativeVideoDriver;
    var PlaybackReposition = modules.PlaybackReposition;
    var PlaybackSession = modules.PlaybackSession;
    var PlaybackTimeline = modules.PlaybackTimeline;
    var SubtitleRuntime = modules.SubtitleRuntime;
    var PlayerControlsController = modules.PlayerControlsController;
    var PlayerSubtitleEditorController = modules.PlayerSubtitleEditorController;
    var PlayerQueueController = modules.PlayerQueueController;
    var InputCommandRouter = modules.InputCommandRouter;
    var PlaybackQueueModel = modules.PlaybackQueueModel;
    var PlayerControlsState = modules.PlayerControlsState;
    var PlayerControlsView = modules.PlayerControlsView;
    var PlayerBufferingIndicator = modules.PlayerBufferingIndicator;
    var ChapterState = modules.ChapterState;
    var PlayerChaptersView = modules.PlayerChaptersView;
    var SkipMarkerState = modules.SkipMarkerState;
    var PlaybackClock = modules.PlaybackClock;
    var PlaybackRecovery = modules.PlaybackRecovery;
    var PlaybackStrategy = modules.PlaybackStrategy;
    var PlayerSeekController = modules.PlayerSeekController;
    var PlayerTimelinePolicy = modules.PlayerTimelinePolicy;
    var ResumeChoice = modules.ResumeChoice;
    var SubtitleSync = modules.SubtitleSync;
    var SubtitleEditorSession = modules.SubtitleEditorSession;
    var SubtitleEditorView = modules.SubtitleEditorView;
    var SubtitleStyleDialog = modules.SubtitleStyleDialog;
    var Settings = modules.Settings;
    var SubtitleOffsetStore = modules.SubtitleOffsetStore;
    var SubtitleSeriesOffset = modules.SubtitleSeriesOffset;
    var AssSubtitleRenderer = modules.AssSubtitleRenderer;
    var AssSubtitlePrefetchPolicy = root.PloffAssSubtitlePrefetchPolicy;
    var VersionSelection = modules.VersionSelection;
    var MediaInfo = modules.MediaInfo;
    var MediaProfile = modules.MediaProfile;
    var MediaChoiceModel = modules.MediaChoiceModel;
    var ProgressiveImages = modules.ProgressiveImages;
    var UpNextState = modules.UpNextState;
    var UpNextTiming = modules.UpNextTiming;
    var UpNextView = modules.UpNextView;
    if (!InputCommandRouter || typeof InputCommandRouter.playerQueue !== 'function') {
      throw new Error('PlayerFeatureController requires InputCommandRouter');
    }
    var formatTime = PlayerTimelinePolicy && PlayerTimelinePolicy.formatTime ? PlayerTimelinePolicy.formatTime : function (value) { return String(value || 0); };
    var formatLongTime = PlayerTimelinePolicy && PlayerTimelinePolicy.formatLongTime ? PlayerTimelinePolicy.formatLongTime : formatTime;
    var destroyed = false;
    var initialized = false;
    var generation = 0;
    var playbackQueueController = null;
    var playerQueueController = null;
    var queueGapController = null;
    var queueGapView = null;
    var queueGapSource = '';
    var queueGapGeneration = 0;
    var playerControlsController = null;
    var playbackController = null;
    var playerErrorVisible = false;
    var playerErrorIndex = 0;
    var playerErrorRetryAction = null;
    var playerErrorFallbackAction = null;
    var resumeChoiceState = null;
    var playerControlsView = null;
    var playerChaptersView = null;
    var playerSubtitleEditorController = null;
    var subtitlePanelTransitionTimer = null;
    var containerDirectPlayTransitionTimer = null;
    var containerOriginRestoreTimer = null;
    var containerOriginRestoreStartedAt = 0;
    var containerOriginRestoreGeneration = 0;
    var fixedClickTargets = [];
    var eventListeners = [];
    var ownedTimers = [];
    var upNextView;
    var autoplayPrefetchImage = null;
    var playbackAtEnd = false;
    var episodeCommandGeneration = 0;
    var nextAssTarget = null;
    var nextAssPrefetchKey = '';
    var standaloneDetailState = null;

    function call(callback, arg1, arg2, arg3, arg4, arg5, arg6) {
      if (typeof callback === 'function') { return callback(arg1, arg2, arg3, arg4, arg5, arg6); }
      return undefined;
    }


    function requireCreate(moduleValue, name) {
      if (!moduleValue || typeof moduleValue.create !== 'function') { throw new Error('PlayerFeatureController requires ' + name); }
      return moduleValue;
    }

    function t(key, parameters) { return call(shellPorts.t, key, parameters) || key; }
    function setText(id, text) { return call(shellPorts.setText, id, text); }
    function element(tagName, className, text) { return call(shellPorts.element, tagName, className, text); }
    function showMessage(text) { return call(shellPorts.showMessage, text); }
    function loadRenderedPoster(image, source, priority, scope, width, height) {
      return call(shellPorts.loadRenderedPoster, image, source, priority, scope, width, height);
    }
    function artworkUrl(item) { return call(shellPorts.artworkUrl, item) || ''; }
    function currentSettings() { return call(settingsPorts.settings) || {}; }
    function imageRequestUrl(source, width, height, scope) {
      var size = { width: width, height: height };
      if (ProgressiveImages && ProgressiveImages.qualitySize && ProgressiveImages.qualityForScope) {
        size = ProgressiveImages.qualitySize(width, height, ProgressiveImages.qualityForScope(currentSettings(), scope));
      }
      return PlexClient.posterUrl(config, source, size.width, size.height);
    }
    function currentView() { return String(call(statePorts.currentView) || 'home'); }
    function setAppView(view) { return call(statePorts.setView, view); }
    function enterDetailView() {
      if (typeof statePorts.enterDetail === 'function') { return statePorts.enterDetail(); }
      return setAppView('detail');
    }
    function setPlaybackIdentity(identity) { return call(statePorts.setPlaybackIdentity, identity); }
    function pointerSelectionActive() { return call(statePorts.pointerSelectionActive) === true; }
    function navigationHasFocus() { return call(statePorts.navigationHasFocus) === true; }
    function activeServerIdentity() {
      var server = call(dataPorts.activeServer) || null;
      return server && (server.machineIdentifier || server.uri) || config.apiBaseUrl || 'local';
    }
    function subtitlePresentationIdentity() {
      var identity = call(dataPorts.mediaIdentity);
      if (identity && typeof identity === 'object') {
        return [identity.server || identity.uri || activeServerIdentity(), identity.profile || 'local'].join('|');
      }
      return activeServerIdentity();
    }
    function detailSnapshot() { return standaloneDetailState || call(detailPorts.snapshot) || {}; }
    function subtitlePresentationDetail(playbackValue) {
      var state = detailSnapshot();
      return state.currentDetail || state.selectedItem || playbackValue || null;
    }
    function subtitlePresentation(track, playbackValue) {
      if (!SubtitleSeriesOffset) { return null; }
      return SubtitleSeriesOffset.resolve(storage, subtitlePresentationIdentity(), subtitlePresentationDetail(playbackValue), track || null);
    }
    function selectedPlaybackSubtitleTrack(playbackValue) {
      var playback = playbackValue || currentPlayerPlayback();
      return playback ? selectedSubtitleTrack(playback, playback.options && playback.options.subtitleStreamID) : null;
    }
    function globalSubtitlePresentation() {
      var settings = currentSettings();
      return {
        subtitleSize: Number(settings.subtitleSize || 100),
        subtitleBackground: String(settings.subtitleBackground || 'off'),
        subtitleEdge: String(settings.subtitleEdge || 'shadow'),
        renderSrt: settings.subtitleRenderingSrt === true,
        renderAss: settings.subtitleRenderingAss === true,
        offsetMs: 0
      };
    }
    function subtitlePresentationLayers(playbackValue) {
      var playback = playbackValue || currentPlayerPlayback();
      var track = selectedPlaybackSubtitleTrack(playback);
      if (!SubtitleSeriesOffset || typeof SubtitleSeriesOffset.resolveLayers !== 'function') { return { media: null, season: null }; }
      return SubtitleSeriesOffset.resolveLayers(storage, subtitlePresentationIdentity(), subtitlePresentationDetail(playback), track);
    }
    function subtitlePresentationParent(playbackValue) {
      if (!SubtitleSeriesOffset || typeof SubtitleSeriesOffset.parent !== 'function') { return globalSubtitlePresentation(); }
      return SubtitleSeriesOffset.parent(storage, subtitlePresentationIdentity(), subtitlePresentationDetail(playbackValue), globalSubtitlePresentation(), selectedPlaybackSubtitleTrack(playbackValue));
    }
    function effectiveSubtitlePresentation(playbackValue, preferredTrack) {
      if (!SubtitleSeriesOffset || typeof SubtitleSeriesOffset.effective !== 'function') { return globalSubtitlePresentation(); }
      var playback = playbackValue || currentPlayerPlayback();
      var track = selectedPlaybackSubtitleTrack(playback) || preferredTrack || null;
      return SubtitleSeriesOffset.effective(storage, subtitlePresentationIdentity(), subtitlePresentationDetail(playback), globalSubtitlePresentation(), track);
    }
    function mergeSubtitlePresentation(baseValue, overrideValue) {
      var result = copyRecord(baseValue) || {};
      var override = overrideValue || {};
      var key;
      for (key in override) {
        if (Object.prototype.hasOwnProperty.call(override, key)) { result[key] = override[key]; }
      }
      return result;
    }
    function subtitlePresentationScope(layers) {
      if (layers && layers.media) { return 'media'; }
      if (layers && layers.season) { return 'season'; }
      return 'global';
    }
    function saveMediaSubtitleEffective(playbackValue, effectiveValue) {
      var detail = subtitlePresentationDetail(playbackValue);
      var parent;
      var sparse;
      var playback = playbackValue || currentPlayerPlayback();
      var track = selectedPlaybackSubtitleTrack(playback);
      if (!SubtitleSeriesOffset || !detail || !effectiveValue || !track || typeof SubtitleSeriesOffset.saveProfile !== 'function') { return false; }
      parent = subtitlePresentationParent(playback);
      sparse = SubtitleSeriesOffset.diff(parent, effectiveValue);
      return SubtitleSeriesOffset.saveProfile(storage, subtitlePresentationIdentity(), detail, 'media', track, sparse);
    }
    function detailPlaybackPreferences(versionAffinity) {
      var result = call(detailPorts.playbackPreferences, versionAffinity) || {};
      var presentation = effectiveSubtitlePresentation(null, result.subtitleTrackPreference || null);
      if (presentation && presentation.subtitleSize) { result.subtitleSize = presentation.subtitleSize; }
      return result;
    }
    function detailPlaybackPreferencesFor(detail, versionAffinity) {
      return call(detailPorts.playbackPreferencesFor, detail, versionAffinity) || detailPlaybackPreferences(versionAffinity);
    }
    function saveDetailMediaOverride() { return call(detailPorts.saveMediaOverride); }
    function applyLocalPlaybackProgress(ratingKey, seconds) { return call(detailPorts.applyLocalPlaybackProgress, ratingKey, seconds); }
    function playbackQueueSnapshot() { return playbackQueueController ? playbackQueueController.snapshot() : {}; }

    function copyRecord(source) {
      var result;
      var key;
      if (!source || typeof source !== 'object') { return source || null; }
      result = {};
      for (key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) { result[key] = source[key]; }
      }
      return result;
    }

    function copyRecords(source) {
      return (source || []).map(function (item) { return copyRecord(item); });
    }

    function copyQueueRecord(source) {
      var result;
      if (!source) { return null; }
      result = copyRecord(source);
      if (Object.prototype.hasOwnProperty.call(source, 'items')) { result.items = copyRecords(source.items); }
      return result;
    }

    function copyPlaybackRecord(source) {
      var result;
      if (!source) { return null; }
      result = copyRecord(source);
      result.options = copyRecord(source.options);
      result.audioTracks = copyRecords(source.audioTracks);
      result.subtitleTracks = copyRecords(source.subtitleTracks);
      result.mediaVersions = copyRecords(source.mediaVersions);
      result.markers = copyRecords(source.markers);
      result.chapters = copyRecords(source.chapters);
      result.mediaProfile = copyRecord(source.mediaProfile);
      return result;
    }

    function copyQueueSnapshot(source) {
      var result = copyRecord(source) || {};
      var drawer;
      var upNext;
      var target;
      source = source || {};
      if (Object.prototype.hasOwnProperty.call(source, 'playlistQueue')) { result.playlistQueue = copyQueueRecord(source.playlistQueue); }
      if (Object.prototype.hasOwnProperty.call(source, 'seriesQueue')) { result.seriesQueue = copyQueueRecord(source.seriesQueue); }
      if (Object.prototype.hasOwnProperty.call(source, 'drawer')) {
        drawer = copyRecord(source.drawer) || {};
        if (source.drawer && Object.prototype.hasOwnProperty.call(source.drawer, 'queue')) { drawer.queue = copyQueueRecord(source.drawer.queue); }
        result.drawer = drawer;
      }
      if (Object.prototype.hasOwnProperty.call(source, 'upNext')) {
        upNext = copyRecord(source.upNext) || {};
        target = copyRecord(source.upNext && source.upNext.target);
        if (target) {
          if (source.upNext.target && Object.prototype.hasOwnProperty.call(source.upNext.target, 'item')) { target.item = copyRecord(source.upNext.target.item); }
          if (source.upNext.target && Object.prototype.hasOwnProperty.call(source.upNext.target, 'queue')) { target.queue = copyQueueRecord(source.upNext.target.queue); }
        }
        if (source.upNext && Object.prototype.hasOwnProperty.call(source.upNext, 'target')) { upNext.target = target; }
        if (source.upNext && Object.prototype.hasOwnProperty.call(source.upNext, 'view')) { upNext.view = copyRecord(source.upNext.view); }
        result.upNext = upNext;
      }
      if (Object.prototype.hasOwnProperty.call(source, 'directPlayOrigin')) { result.directPlayOrigin = copyRecord(source.directPlayOrigin); }
      if (Object.prototype.hasOwnProperty.call(source, 'containerOrigin')) { result.containerOrigin = copyRecord(source.containerOrigin); }
      return result;
    }

    function cycleValue(list, current, direction) {
      var index = list.indexOf(current);
      if (index < 0) { index = 0; }
      return list[Math.max(0, Math.min(list.length - 1, index + (direction < 0 ? -1 : 1)))];
    }

    function subtitleSizeValues() {
      var values = Settings && Settings.SUBTITLE_SIZES;
      return values && values.length ? values.slice() : [100];
    }

    function mediaVersionLabel(profile, automatic) {
      return MediaChoiceModel.versionLabel(profile, {
        automatic: automatic,
        automaticLabel: t('player.versionAuto'),
        unavailable: t('player.unavailable')
      });
    }
    function openDetail(item) { return call(detailPorts.openItem, item); }
    function openPlayerMediaInfo() {
      var playerPlayback = playbackController ? playbackController.snapshot().playback : null;
      if (!playerPlayback || !playerPlayback.mediaProfile || !MediaInfo || typeof MediaInfo.create !== 'function') { return false; }
      return call(dialogsPorts.openMediaInfo, MediaInfo.create(playerPlayback.mediaProfile, playerPlayback.options || {}, t, { recoveryTrace: playerPlayback.diagnosticRecoveryTrace || '' }), 'player');
    }
    function clearOwnedTimer(timer) {
      var index;
      if (timer === null || timer === undefined) { return null; }
      index = ownedTimers.indexOf(timer);
      if (index !== -1) { ownedTimers.splice(index, 1); }
      if (root.clearTimeout) { root.clearTimeout(timer); }
      return null;
    }
    function scheduleOwned(callback, delay) {
      var timer;
      var scheduledGeneration = generation;
      if (!root.setTimeout) {
        if (!destroyed && scheduledGeneration === generation) { callback(); }
        return null;
      }
      timer = root.setTimeout(function () {
        var index = ownedTimers.indexOf(timer);
        if (index !== -1) { ownedTimers.splice(index, 1); }
        if (!destroyed && scheduledGeneration === generation) { callback(); }
      }, Math.max(0, Number(delay || 0)));
      ownedTimers.push(timer);
      return timer;
    }

    function bindEvent(target, name, handler, optionsValue) {
      if (!target || !target.addEventListener) { return; }
      target.addEventListener(name, handler, optionsValue || false);
      eventListeners.push({ target: target, name: name, handler: handler, options: optionsValue || false });
    }
    function bindClick(id, handler) {
      var target = document.getElementById(id);
      if (!target) { return; }
      target.onclick = handler;
      fixedClickTargets.push(target);
    }

    // Player controls presentation. Native playback state is owned by PlaybackController.
    function currentPlayerPlayback() {
      return playbackController ? playbackController.snapshot().playback : null;
    }

    function subtitleEditorAvailability() {
      var playback;
      var selectedId;
      var selectedTrack;
      var compatibleTrack;
      if (!playbackController || typeof playbackController.subtitleEditorAvailability !== 'function') {
        return { enabled: false, reason: 'unsupported' };
      }
      playback = currentPlayerPlayback();
      selectedId = String(playback && playback.options && playback.options.subtitleStreamID || '');
      selectedTrack = selectedSubtitleTrack(playback, selectedId);
      if (selectedTrack && SubtitleSync && !SubtitleSync.advancedEditorSupported(selectedTrack)) {
        return { enabled: false, reason: 'unsupported' };
      }
      if (!selectedId && playback && SubtitleSync) {
        compatibleTrack = (playback.subtitleTracks || []).some(function (track) {
          return SubtitleSync.advancedEditorSupported(track);
        });
        if (!compatibleTrack) { return { enabled: false, reason: 'unsupported' }; }
      }
      return playbackController.subtitleEditorAvailability();
    }

    function subtitleOffsetFor(track, playbackValue) {
      var playback = playbackValue || currentPlayerPlayback();
      var classification;
      var identity;
      var presentation;
      if (!playback || !track || !SubtitleSync) { return 0; }
      presentation = subtitlePresentation(track, playback);
      if (presentation) { return Math.round(Number(presentation.offsetMs || 0)); }
      classification = SubtitleSync.classify(track);
      if (classification.kind === 'external-text' || classification.kind === 'external-ass') { return Math.round(Number(track.offset || 0)); }
      if ((classification.kind !== 'embedded-text' && classification.kind !== 'embedded-ass') || !SubtitleOffsetStore) { return 0; }
      identity = activeServerIdentity();
      return SubtitleOffsetStore.get(storage, identity, playback.partId, track.id);
    }

    function ensurePlayerControlsView() {
      if (!playerControlsView) { playerControlsView = PlayerControlsView.create({ document: document, setText: setText }); }
      return playerControlsView;
    }

    function loadSubtitlePresentation(playbackValue) {
      var playback = playbackValue || currentPlayerPlayback();
      var globals = globalSubtitlePresentation();
      var layers = subtitlePresentationLayers(playback);
      var parent = mergeSubtitlePresentation(globals, layers.season);
      return {
        effective: mergeSubtitlePresentation(parent, layers.media),
        parent: parent,
        globals: globals,
        layers: layers,
        scope: subtitlePresentationScope(layers),
        inheritedStreamID: playback ? inheritedSubtitleStreamId(playback) : ''
      };
    }

    function selectedSubtitleTrack(playbackValue, streamId) {
      if (!playbackValue) { return null; }
      return MediaInfo.selectedTrack(playbackValue.subtitleTracks || [], String(streamId || ''));
    }

    function saveSubtitlePresentation(scope, draftValue) {
      var playback = currentPlayerPlayback();
      var detail = subtitlePresentationDetail(playback);
      var draft = draftValue || {};
      var stateValue = draft.state || {};
      var style = draft.style || {};
      var capabilities = draft.capabilities || {};
      var desired;
      var identity;
      var track;
      var streamId;
      var parent;
      var layers;
      var existingLayer;
      var classification;
      var textTrack;
      var sparse;
      var mediaRemainder;
      var mediaLayer;
      function finish(saved) {
        if (saved && draft.trackChanged === true) {
          if (draft.trackChanged === true && draft.trackIntent === 'inherit') {
            call(detailPorts.setTrackPreference, 'subtitles', null, false);
          } else {
            call(detailPorts.setTrackPreference, 'subtitles', track, !streamId);
          }
        }
        return saved;
      }
      if (!SubtitleSeriesOffset || !playback || !detail || typeof SubtitleSeriesOffset.saveProfile !== 'function') { return false; }
      identity = subtitlePresentationIdentity();
      streamId = String(stateValue.selectedStreamID === undefined ? playback.options.subtitleStreamID || '' : stateValue.selectedStreamID || '');
      track = selectedSubtitleTrack(playback, streamId);
      if (!track) { return streamId ? false : finish(true); }
      classification = SubtitleSync && typeof SubtitleSync.classify === 'function' ? SubtitleSync.classify(track) : { kind: '' };
      textTrack = classification.kind === 'external-text' || classification.kind === 'embedded-text';
      layers = SubtitleSeriesOffset.resolveLayers(storage, identity, detail, track);
      existingLayer = scope === 'season' ? layers.season : layers.media;
      desired = {};
      if (capabilities.size !== false) { desired.subtitleSize = Number(stateValue.subtitleSize || playback.options.subtitleSize || 100); }
      else if (classification.kind !== 'unsupported' && existingLayer &&
          Object.prototype.hasOwnProperty.call(existingLayer, 'subtitleSize')) {
        desired.subtitleSize = existingLayer.subtitleSize;
      }
      if (capabilities.offset !== false) { desired.offsetMs = Math.round(Number(stateValue.offsetMs || 0)); }
      else if (existingLayer && Object.prototype.hasOwnProperty.call(existingLayer, 'offsetMs')) { desired.offsetMs = existingLayer.offsetMs; }
      if (capabilities.background !== false) { desired.subtitleBackground = String(style.subtitleBackground || 'off'); }
      else if (textTrack && existingLayer && Object.prototype.hasOwnProperty.call(existingLayer, 'subtitleBackground')) {
        desired.subtitleBackground = existingLayer.subtitleBackground;
      }
      if (capabilities.edge !== false) { desired.subtitleEdge = String(style.subtitleEdge || 'shadow'); }
      else if (textTrack && existingLayer && Object.prototype.hasOwnProperty.call(existingLayer, 'subtitleEdge')) {
        desired.subtitleEdge = existingLayer.subtitleEdge;
      }
      if (scope === 'season') {
        sparse = SubtitleSeriesOffset.diff(globalSubtitlePresentation(), desired);
        mediaLayer = layers.media || {};
        mediaRemainder = {};
        if (capabilities.size === false && classification.kind !== 'unsupported' &&
            Object.prototype.hasOwnProperty.call(mediaLayer, 'subtitleSize')) {
          mediaRemainder.subtitleSize = mediaLayer.subtitleSize;
        }
        if (capabilities.offset === false && Object.prototype.hasOwnProperty.call(mediaLayer, 'offsetMs')) {
          mediaRemainder.offsetMs = mediaLayer.offsetMs;
        }
        if (capabilities.background === false && textTrack &&
            Object.prototype.hasOwnProperty.call(mediaLayer, 'subtitleBackground')) {
          mediaRemainder.subtitleBackground = mediaLayer.subtitleBackground;
        }
        if (capabilities.edge === false && textTrack &&
            Object.prototype.hasOwnProperty.call(mediaLayer, 'subtitleEdge')) {
          mediaRemainder.subtitleEdge = mediaLayer.subtitleEdge;
        }
        return finish(typeof SubtitleSeriesOffset.updateProfileLayers === 'function'
          ? SubtitleSeriesOffset.updateProfileLayers(storage, identity, detail, track, sparse, true, mediaRemainder)
          : SubtitleSeriesOffset.saveSeason(storage, identity, detail, { track: track, subtitleSize: sparse.subtitleSize, offsetMs: sparse.offsetMs, subtitleBackground: sparse.subtitleBackground, subtitleEdge: sparse.subtitleEdge }));
      }
      if (draft.resetSeason === true && typeof SubtitleSeriesOffset.clearProfile === 'function') {
        if (!SubtitleSeriesOffset.clearProfile(storage, identity, detail, 'season', track)) { return false; }
      }
      parent = SubtitleSeriesOffset.parent(storage, identity, detail, globalSubtitlePresentation(), track);
      sparse = SubtitleSeriesOffset.diff(parent, desired);
      return finish(SubtitleSeriesOffset.saveProfile(storage, identity, detail, 'media', track, sparse));
    }

    function resetSubtitlePresentation(scope, playbackValue) {
      var playback = playbackValue || currentPlayerPlayback();
      var layers;
      var globals;
      var effective;
      if (!SubtitleSeriesOffset || !playback) { return null; }
      layers = subtitlePresentationLayers(playback);
      globals = globalSubtitlePresentation();
      if (scope === 'season') {
        effective = mergeSubtitlePresentation(globals, layers.media);
        return {
          effective: effective,
          selectedStreamID: String(playback.options.subtitleStreamID || ''),
          scope: layers.media ? 'media' : 'global',
          trackIntent: 'inherit',
          resetSeason: true
        };
      }
      effective = mergeSubtitlePresentation(globals, layers.season);
      return {
        effective: effective,
        selectedStreamID: String(playback.options.subtitleStreamID || ''),
        scope: layers.season ? 'season' : 'global',
        trackIntent: 'inherit',
        resetSeason: false
      };
    }

    function previewEffectiveSubtitleStyle(playbackValue) {
      var effective = effectiveSubtitlePresentation(playbackValue);
      var settings = currentSettings();
      call(settingsPorts.previewSubtitleStyle, {
        subtitleBackground: effective.subtitleBackground,
        subtitleEdge: effective.subtitleEdge,
        subtitleSize: effective.subtitleSize,
        subtitlePosition: Number(settings.subtitlePosition || 7)
      });
    }

    function setPlayerLoading(loading, preserveFrame) {
      ensurePlayerControlsView().renderLoading(loading, preserveFrame);
    }

    function updatePlayerDisplay(position, duration, snapshot) {
      var current = snapshot || (playbackController ? playbackController.snapshot() : null);
      var displayTime = position === undefined ? (current ? current.positionSeconds : 0) : Number(position || 0);
      var total = duration === undefined ? (current ? current.durationSeconds : 0) : Number(duration || 0);
      ensurePlayerControlsView().renderProgress({
        progress: total ? displayTime / total * 100 : 0,
        currentTime: formatTime(displayTime), duration: formatTime(total), paused: current ? current.paused : true,
        playLabel: t('player.play'), pauseLabel: t('player.pause')
      });
      updateSkipPrompt();
    }

    function playerControlsSnapshot() {
      return playerControlsController ? playerControlsController.snapshot() : {
        mode: 'hidden', visible: false, zone: 'buttons', buttonIndex: 1,
        settingsOpen: false, settingIndex: 0,
        chapter: ChapterState.create(), chapters: ChapterState.create(),
        skip: SkipMarkerState.create()
      };
    }

    function playerControlsPlaybackSnapshot() {
      var current = playbackController ? playbackController.snapshot() : null;
      var playback = current && current.playback;
      return {
        active: currentView() === 'player' && !!playback,
        positionSeconds: current ? current.positionSeconds : 0,
        durationSeconds: current ? current.durationSeconds : 0,
        markers: playback && playback.markers || [],
        chapters: playback && playback.chapters || [],
        skipPromptDuration: currentSettings().skipPromptDuration,
        seekSettling: !!(current && (
          (current.pendingSeek !== null && current.pendingSeek !== undefined) ||
          current.nativeSeekPending || current.decoderSettlementPending || current.streamSwitching
        ))
      };
    }

    function playerSkipMarkerClass(hidden, snapshot) {
      var current = snapshot || playerControlsSnapshot();
      var className = 'player-skip-marker';
      if (current.mode === 'full') { className += ' is-controls-full'; }
      else if (current.mode === 'timeline') { className += ' is-controls-timeline'; }
      if (hidden) { className += ' is-hidden'; }
      else if (current.zone === 'skip') { className += ' is-focused'; }
      return className;
    }

    function renderPlayerControlsMode(snapshot) {
      ensurePlayerControlsView().renderMode(snapshot.mode);
    }

    function renderPlayerSkipState(snapshot) {
      var button = document.getElementById('player-skip-marker');
      var skip = snapshot.skip || SkipMarkerState.create();
      if (snapshot.settingsOpen || !skip.visible || !skip.marker) {
        button.className = playerSkipMarkerClass(true, snapshot);
        return;
      }
      setText('player-skip-marker', t(skip.marker.type === 'intro' ? 'player.skipIntro' : 'player.skipCredits'));
      button.className = playerSkipMarkerClass(false, snapshot);
    }

    function resetSkipPrompt() { if (playerControlsController) { playerControlsController.resetSkip(); } }

    function updateSkipPrompt() { if (playerControlsController) { playerControlsController.updateSkip(); } }

    function updateEstimatedEndTime(position, duration) {
      var current = playbackController ? playbackController.snapshot() : null;
      var remaining;
      var end;
      var hours;
      var minutes;
      if (!current || !current.active || currentView() !== 'player') { setText('player-end-time', ''); return; }
      position = position === undefined ? current.positionSeconds : Number(position || 0);
      duration = duration === undefined ? current.durationSeconds : Number(duration || 0);
      remaining = Math.max(0, duration - position);
      end = new Date(new Date().getTime() + remaining * 1000);
      hours = String(end.getHours());
      minutes = String(end.getMinutes());
      setText('player-end-time', t('player.endsAt', {
        time: (hours.length < 2 ? '0' : '') + hours + ':' + (minutes.length < 2 ? '0' : '') + minutes
      }));
    }


    function playerChapters() {
      var playback = currentPlayerPlayback();
      return playback && playback.chapters ? playback.chapters : [];
    }

    function ensurePlayerChaptersView() {
      if (!playerChaptersView) {
        playerChaptersView = PlayerChaptersView.create({
          document: document, element: element, t: t, formatTime: formatTime,
          pointerActive: function () { return !!(pointerSelectionActive()); },
          ProgressiveImages: ProgressiveImages, posterLoader: shellPorts.posterLoader()
        });
      }
      return playerChaptersView;
    }

    function chapterHintVisible() {
      return !!(playerControlsController && playerControlsController.chapterHintVisible());
    }

    function renderChapterHint(snapshot) {
      var current = snapshot || playerControlsSnapshot();
      var visible = chapterHintVisible();
      ensurePlayerChaptersView().renderHint(visible, visible && current.zone === 'chapter-hint');
    }

    function updateChapterFocus(snapshot) {
      var current = snapshot || playerControlsSnapshot();
      var chapter = current.chapter || current.chapters || ChapterState.create();
      ensurePlayerChaptersView().updateFocus(chapter.index, chapter.open);
    }

    function renderChapterDrawer(snapshot) {
      var current = snapshot || playerControlsSnapshot();
      ensurePlayerChaptersView().render(playerChapters(), current.chapter || current.chapters || ChapterState.create());
    }

    function renderPlayerChaptersState(snapshot) {
      var chapter = snapshot.chapter || snapshot.chapters || ChapterState.create();
      renderChapterHint(snapshot);
      if (chapter.open) { renderChapterDrawer(snapshot); }
      else { ensurePlayerChaptersView().close(); }
    }

    function closeChapterDrawer(restoreFocus) { if (playerControlsController) { playerControlsController.closeChapters(restoreFocus); } }

    function resetChapterDrawer() {
      if (playerControlsController) { playerControlsController.resetChapters(); }
      else { ensurePlayerChaptersView().reset(); }
    }

    function showPlayerControls() { if (playerControlsController) { playerControlsController.showFull(); } }

    function initializePlayerControlsHidden() {
      playerQueueController.close(false);
      if (playerControlsController) { playerControlsController.initializeHidden(); }
    }

    function playerButtonAvailable(index) {
      return ensurePlayerControlsView().buttonAvailable(index);
    }

    function playerButtonAction(index) {
      var buttons = document.querySelectorAll('.player-button');
      var id = buttons[index] && buttons[index].id || '';
      if (id === 'player-previous') { return 'previous'; }
      if (id === 'player-next') { return 'next'; }
      if (id === 'player-playlist-queue-button') { return 'queue'; }
      if (id === 'player-settings-button') { return 'settings'; }
      return 'toggle';
    }

    function renderPlayerFocusState(snapshot) {
      var buttons = document.querySelectorAll('.player-button');
      var skipButton = document.getElementById('player-skip-marker');
      var chapterHint = document.getElementById('player-chapters-hint');
      var index;
      var buttonIndex = Math.max(0, Math.min(buttons.length - 1, Number(snapshot.buttonIndex || 0)));
      document.getElementById('player-timeline-button').className = 'player-timeline-button' + (!snapshot.settingsOpen && snapshot.zone === 'timeline' ? ' is-focused' : '');
      skipButton.className = playerSkipMarkerClass(!(snapshot.skip && snapshot.skip.visible), snapshot);
      renderChapterHint(snapshot);
      for (index = 0; index < buttons.length; index += 1) {
        buttons[index].className = buttons[index].className.replace(/\s*is-focused/g, '') +
          (!snapshot.settingsOpen && snapshot.zone === 'buttons' && index === buttonIndex ? ' is-focused' : '');
      }
      if (snapshot.settingsOpen) { return; }
      if (pointerSelectionActive()) { return; }
      if (snapshot.zone === 'chapters') { updateChapterFocus(snapshot); }
      else if (snapshot.zone === 'chapter-hint' && chapterHintVisible()) { chapterHint.focus(); }
      else if (snapshot.zone === 'skip' && snapshot.skip && snapshot.skip.visible) { skipButton.focus(); }
      else if (snapshot.zone === 'timeline') { document.getElementById('player-timeline-button').focus(); }
      else if (buttons[buttonIndex]) { buttons[buttonIndex].focus(); }
    }

    function updatePlayerButtonFocus() {
      if (playerControlsController) { renderPlayerFocusState(playerControlsController.snapshot()); }
    }

    function episodeCommandAvailable(state) {
      return state === 'available' || state === 'confirmation-required';
    }

    function nextAssPrefetchIdentity(target, snapshotValue) {
      var current = currentPlayerPlayback() || {};
      var options = current.options || {};
      var item = target && (target.item || target) || {};
      return [
        current.ratingKey || '',
        current.partId || '',
        options.mediaIndex !== undefined ? options.mediaIndex : current.mediaIndex || 0,
        options.partIndex !== undefined ? options.partIndex : current.partIndex || 0,
        options.subtitleStreamID || '',
        item.ratingKey || '',
        target && (target.occurrenceId || target.index) || '',
        snapshotValue && snapshotValue.durationSeconds || ''
      ].join('|');
    }

    function maybePrefetchNextAss(snapshotValue) {
      var current;
      var markers;
      var position;
      var duration;
      var key;
      if (!AssSubtitlePrefetchPolicy || typeof AssSubtitlePrefetchPolicy.due !== 'function' || !nextAssTarget) { return false; }
      current = currentPlayerPlayback();
      if (!current || !snapshotValue) { return false; }
      position = Number(snapshotValue.positionSeconds || 0);
      duration = Number(snapshotValue.durationSeconds || 0);
      markers = snapshotValue.markers || current.markers || [];
      if (!AssSubtitlePrefetchPolicy.due(position, duration, markers)) { return false; }
      key = nextAssPrefetchIdentity(nextAssTarget, snapshotValue);
      if (!key || key === nextAssPrefetchKey) { return false; }
      nextAssPrefetchKey = key;
      call(dataPorts.prefetchNextAss, nextAssTarget, detailPlaybackPreferencesFor(nextAssTarget.detail, null), key);
      return true;
    }

    function resetNextAssTarget() {
      nextAssTarget = null;
      nextAssPrefetchKey = '';
    }

    function updateEpisodeCommands() {
      var sequence = playbackQueueSnapshot().sequence || {};
      var availability = {
        previous: episodeCommandAvailable(sequence.previousState),
        next: episodeCommandAvailable(sequence.nextState)
      };
      var requestGeneration = episodeCommandGeneration + 1;

      episodeCommandGeneration = requestGeneration;
      ensurePlayerControlsView().renderEpisodeCommands(availability.previous, availability.next);

      function render() {
        if (destroyed || requestGeneration !== episodeCommandGeneration) { return; }
        ensurePlayerControlsView().renderEpisodeCommands(availability.previous, availability.next);
      }

      function resolve(direction, key) {
        var immediate;
        if (!playbackQueueController) { return; }
        immediate = playbackQueueController.resolveAdjacentState(direction, function (error, result) {
          if (destroyed || requestGeneration !== episodeCommandGeneration) { return; }
          availability[key] = !error && !!result && episodeCommandAvailable(result.state);
          if (key === 'next') {
            if (!error && result && result.state === 'available') {
              nextAssTarget = result;
              prefetchAutoplayBackdrop(result);
              maybePrefetchNextAss(playbackController && playbackController.snapshot());
            } else {
              resetNextAssTarget();
              call(dataPorts.cancelAssPrefetch, 'next ASS target unavailable');
            }
          }
          render();
        }, detailQueueSnapshot());
        if (immediate && immediate.state !== 'resolving') {
          availability[key] = episodeCommandAvailable(immediate.state);
          render();
        }
      }

      resolve(-1, 'previous');
      resolve(1, 'next');
    }

    function trackLabel(tracks, id, offLabel) {
      var index;
      if (!id) { return offLabel; }
      for (index = 0; index < tracks.length; index += 1) {
        if (tracks[index].id === id) { return MediaProfile.trackDisplayLabel(tracks[index], t('detail.external')); }
      }
      return offLabel;
    }

    function formatSignedSubtitleOffset(offsetMs) {
      var offset = Math.round(Number(offsetMs || 0));
      return (offset > 0 ? '+' : '') + offset + ' ms';
    }

    function subtitleTrackLabelWithOffset(playbackValue) {
      var playback = playbackValue || currentPlayerPlayback();
      var track;
      var label;
      var offset;
      if (!playback) { return t('subtitle.off'); }
      track = MediaInfo.selectedTrack(playback.subtitleTracks, playback.options.subtitleStreamID);
      label = trackLabel(playback.subtitleTracks, playback.options.subtitleStreamID, t('subtitle.off'));
      offset = subtitleOffsetFor(track, playback);
      return offset ? label + ' \u00b7 ' + formatSignedSubtitleOffset(offset) : label;
    }

    function playerSettingDisabled(settingKey, advanced, playbackValue) {
      var playback = playbackValue || currentPlayerPlayback();
      var audioTracks = playback && playback.audioTracks || [];
      var subtitleTracks = playback && playback.subtitleTracks || [];
      var mediaVersions = playback && playback.mediaVersions || [];
      if (settingKey === 'audio') { return audioTracks.length < 2; }
      if (settingKey === 'subtitles') { return subtitleTracks.length === 0; }
      if (settingKey === 'size') { return subtitleTracks.length === 0 || !playback || !playback.options.subtitleStreamID; }
      if (settingKey === 'subtitle-advanced') { return !advanced.enabled; }
      if (settingKey === 'version') { return mediaVersions.length < 2; }
      return false;
    }

    function playerSettingRows() {
      return document.querySelectorAll('.setting-row, .playback-info');
    }

    function playerSettingsRowsSnapshot() {
      var rows = playerSettingRows();
      var playback = currentPlayerPlayback();
      var advanced = subtitleEditorAvailability();
      var result = [];
      var key;
      var index;
      for (index = 0; index < rows.length; index += 1) {
        key = rows[index].getAttribute('data-setting') || '';
        result.push({ key: key, disabled: playerSettingDisabled(key, advanced, playback) });
      }
      return result;
    }

    function updateSettingsDisplay(snapshot) {
      var current = snapshot || playerControlsSnapshot();
      var playback = currentPlayerPlayback();
      var rows = playerSettingRows();
      var advanced;
      var disabled;
      var focusIndex = Math.max(0, Math.min(rows.length - 1, Number(current.settingIndex || 0)));
      var settingKey;
      var index;
      advanced = playback ? subtitleEditorAvailability() : { enabled: false };
      if (playback) {
        setText('setting-audio', trackLabel(playback.audioTracks, playback.options.audioStreamID, t('player.automatic')));
        setText('setting-subtitles', subtitleTrackLabelWithOffset(playback));
        setText('setting-size', playback.options.subtitleSize + '%');
        setText('setting-subtitle-advanced', t(advanced.enabled ? 'player.subtitleAvailable' : 'player.subtitleUnsupported'));
        setText('setting-version', mediaVersionLabelForPlayback(playback));
        setText('setting-quality', settingsPorts.videoQualityLabel(playback.requestedVideoQuality || playback.options.videoQuality));
        setText('setting-playback-mode', settingsPorts.playbackPreferenceLabel(playback.requestedPlaybackMode || playback.options.playbackMode));
        renderPlayerPlaybackSummary(playback);
        renderPlaybackInfo(playback);
      }
      for (index = 0; index < rows.length; index += 1) {
        settingKey = rows[index].getAttribute('data-setting');
        disabled = playerSettingDisabled(settingKey, advanced, playback);
        rows[index].disabled = disabled;
        rows[index].className = (settingKey === 'media-info' ? 'playback-info' : (settingKey === 'close' ? 'setting-row player-settings-close' : 'setting-row')) +
          (!disabled && settingKey !== 'subtitle-advanced' && settingKey !== 'media-info' && settingKey !== 'close' ? ' is-cycle' : '') +
          (disabled ? ' is-disabled' : '') +
          (current.settingsOpen && index === focusIndex && !disabled ? ' is-focused' : '');
      }
      if (current.settingsOpen && rows[focusIndex] && !rows[focusIndex].disabled && !(pointerSelectionActive())) { rows[focusIndex].focus(); }
    }

    function playbackModeLabel(mode) {
      var keys = {
        'direct-play': 'player.directPlay',
        'direct-stream': 'player.directStream',
        'transcode-audio': 'player.transcodeAudio',
        'transcode-video': 'player.transcodeVideo',
        'transcode-audio-video': 'player.transcodeAudioVideo'
      };
      return t(keys[mode] || 'player.unavailable');
    }

    function compactPlaybackModeLabel(mode) {
      if (mode === 'direct-play') { return t('player.directShort'); }
      if (mode === 'direct-stream') { return t('player.directShort'); }
      if (mode === 'transcode-audio' || mode === 'transcode-video' || mode === 'transcode-audio-video') { return t('player.transcodeShort'); }
      return t('player.unavailable');
    }

    function renderLocalSubtitleRendererBadge(snapshot) {
      var badge = document.getElementById('player-subtitle-renderer-badge');
      var localSubtitle = snapshot && snapshot.localSubtitle;
      var label = '';
      if (snapshot && snapshot.subtitleRenderMode === 'local' && localSubtitle) {
        label = (localSubtitle.rendererType === 'ass' ? 'ASS / SSA' : 'SRT / WebVTT') + ' \u00b7 ' + t('player.localRenderer');
      }
      setText('player-subtitle-renderer-badge', label);
      if (badge) { badge.className = 'player-subtitle-renderer-badge' + (label ? '' : ' is-hidden'); }
    }

    function renderPlayerPlaybackSummary(playbackValue) {
      var runtimeSnapshot = playbackController ? playbackController.snapshot() : null;
      var playback = playbackValue || runtimeSnapshot && runtimeSnapshot.playback || null;
      if (!playback) {
        setText('player-track-audio', t('player.unavailable'));
        setText('player-track-subtitles', t('subtitle.off'));
        setText('player-quality', '');
        setText('player-delivery-mode', '');
        renderLocalSubtitleRendererBadge(null);
        return;
      }
      setText('player-track-audio', trackLabel(playback.audioTracks, playback.options.audioStreamID, t('player.automatic')));
      setText('player-track-subtitles', subtitleTrackLabelWithOffset(playback));
      setText('player-quality', t('player.quality') + ': ' + settingsPorts.videoQualityLabel(playback.options.videoQuality));
      setText('player-connection-route', settingsPorts.connectionRouteLabel());
      setText('player-delivery-mode', compactPlaybackModeLabel(playback.playbackMode));
      renderLocalSubtitleRendererBadge(runtimeSnapshot);
    }

    function renderPlaybackInfo(playbackValue) {
      var playback = playbackValue || currentPlayerPlayback();
      var fileNode;
      var sourceParts;
      var dynamicRange;
      var isTranscoded;
      if (!playback) { return; }
      setText('playback-info-file', playback.fileName || t('player.unavailable'));
      setText('playback-info-size', MediaProfile.detailedSize(playback.fileSize, t('player.unavailable')));
      sourceParts = [];
      if (playback.sourceWidth && playback.sourceHeight) { sourceParts.push(playback.sourceWidth + 'x' + playback.sourceHeight); }
      if (playback.originalVideoCodec) { sourceParts.push(String(playback.originalVideoCodec).toUpperCase()); }
      if (playback.originalContainer) { sourceParts.push(String(playback.originalContainer).toUpperCase()); }
      dynamicRange = String(playback.videoDynamicRange || '');
      if (dynamicRange) { sourceParts.push(dynamicRange); }
      setText('playback-info-source', sourceParts.join(' / ') || t('player.unavailable'));
      isTranscoded = playback.playbackMode === 'transcode-audio-video' || playback.playbackMode === 'transcode-video';
      setText('playback-info-hdr', dynamicRange ? t(isTranscoded ? 'player.hdrTranscoded' : 'player.hdrDirect', { range: dynamicRange }) : t('player.sdr'));
      setText('playback-info-mode', playbackModeLabel(playback.playbackMode) + (playback.diagnosticRecoveryTrace ? ' \u00b7 ' + playback.diagnosticRecoveryTrace : ''));
      fileNode = document.getElementById('playback-info-file');
      if (fileNode) { fileNode.title = playback.fileName || ''; }
    }

    function cycleTrack(tracks, currentId, direction, allowOff) {
      var ids = allowOff ? [SUBTITLE_AUTOMATIC_VALUE, SUBTITLE_OFF_VALUE] : [];
      var index;
      for (index = 0; index < tracks.length; index += 1) { ids.push(tracks[index].id); }
      index = ids.indexOf(currentId);
      if (index === -1 && allowOff) { index = 0; }
      return ids[Math.max(0, Math.min(ids.length - 1, index + direction))] || '';
    }

    function inheritedSubtitleStreamId(playbackValue) {
      var resolved = detailPorts.resolvePlaybackTracks ? call(detailPorts.resolvePlaybackTracks, playbackValue) : null;
      return resolved ? String(resolved.subtitleStreamID || '') : '';
    }

    function applyPlayerTrackChoice(kind, value) {
      var playback = currentPlayerPlayback();
      var direction = typeof value === 'number' ? value : null;
      var tracks;
      var selected;
      var selectedTrack;
      var resolved;
      if (!playback || !playbackController) { return; }
      tracks = kind === 'audio' ? playback.audioTracks : playback.subtitleTracks;
      selected = direction === null ? String(value || '') : cycleTrack(
        tracks || [],
        kind === 'audio' ? playback.options.audioStreamID : playback.options.subtitleStreamID,
        direction,
        kind === 'subtitles'
      );
      if (kind !== 'subtitles') {
        if (selected === SUBTITLE_AUTOMATIC_VALUE) {
          detailPorts.setTrackPreference(kind, null, false);
          resolved = call(detailPorts.resolvePlaybackTracks, playback);
          selected = resolved && resolved.audioStreamID || '';
        } else {
          detailPorts.setTrackPreference(kind, MediaInfo.selectedTrack(tracks, selected), false);
        }
        playbackController.changeTrack(kind, { id: selected, apply: false });
        updateSettingsDisplay();
        return;
      }
      if (selected === SUBTITLE_AUTOMATIC_VALUE) {
        detailPorts.setTrackPreference('subtitles', null, false);
        resolved = call(detailPorts.resolvePlaybackTracks, playback);
        selected = resolved && resolved.subtitleStreamID || '';
      } else if (selected === SUBTITLE_OFF_VALUE || !selected) {
        selected = '';
        detailPorts.setTrackPreference('subtitles', null, true);
      } else {
        selectedTrack = MediaInfo.selectedTrack(tracks, selected);
        detailPorts.setTrackPreference('subtitles', selectedTrack, false);
      }
      playbackController.changeTrack('subtitles', { id: selected, apply: false });
      updateSettingsDisplay();
    }

    function applyPlayerSettingChoice(key, value) {
      var playback = currentPlayerPlayback();
      var controlsState = playerControlsSnapshot();
      var sizes = subtitleSizeValues();
      var direction = typeof value === 'number' ? value : null;
      var index;
      var next;
      if (!playback || !playbackController) { return; }
      if (key === 'size') {
        if (direction === null) { next = Number(value); }
        else {
          index = sizes.indexOf(Number(playback.options.subtitleSize || 100));
          next = sizes[Math.max(0, Math.min(sizes.length - 1, index + direction))];
        }
        playbackController.changeVersion({ kind: 'settings', subtitleSize: next });
        if (playback.options.localSubtitleOverlay && controlsState.settingsSignature &&
            settingsSignatureWithoutSubtitleSize(controlsState.settingsSignature) === settingsSignatureWithoutSubtitleSize(currentPlayerSettingsSignature())) {
          playerControlsController.setSettingsSignature(currentPlayerSettingsSignature());
        }
        (function () {
          var desired = copyRecord(effectiveSubtitlePresentation(playback)) || {};
          desired.subtitleSize = next;
          saveMediaSubtitleEffective(playback, desired);
        }());
      } else if (key === 'quality') {
        next = direction === null ? String(value) : cycleValue(['original', '12000', '8000', '4000'], playback.requestedVideoQuality || playback.options.videoQuality, direction);
        playbackController.changeVersion({ kind: 'settings', videoQuality: next });
      } else if (key === 'playback-mode') {
        next = direction === null ? String(value) : cycleValue(['auto', 'direct', 'transcode'], playback.requestedPlaybackMode || playback.options.playbackMode, direction);
        playbackController.changeVersion({ kind: 'settings', playbackMode: next });
      }
      updateSettingsDisplay();
    }

    function openChoiceDialog(title, choices, selectedValue, apply, returnFocus) {
      return dialogsPorts.openChoice({
        title: title,
        choices: choices,
        selectedValue: selectedValue,
        apply: apply,
        returnFocus: returnFocus
      });
    }
    function openRenderingGlobalConfirmation(name, enabled, confirm, returnFocus) {
      var key = name === 'ass'
        ? (enabled ? 'player.subtitleRenderingAssEnableGlobalConfirm' : 'player.subtitleRenderingAssDisableGlobalConfirm')
        : (enabled ? 'player.subtitleRenderingSrtEnableGlobalConfirm' : 'player.subtitleRenderingSrtDisableGlobalConfirm');
      return dialogsPorts.openChoice({
        title: t(key),
        choices: [
          { value: 'yes', label: t('common.yes') },
          { value: 'no', label: t('common.no') }
        ],
        selectedValue: 'no',
        variant: 'confirm',
        apply: function (choice) { if (choice && choice.value === 'yes') { call(confirm); } },
        returnFocus: returnFocus
      });
    }

    function playerTrackChoices(tracks, includeOff) {
      var choices = MediaChoiceModel.trackChoices(tracks, {
        off: includeOff ? { value: SUBTITLE_OFF_VALUE, label: t('subtitle.off') } : null,
        label: function (track) { return MediaProfile.trackDisplayLabel(track, t('detail.external')); }
      });
      choices.unshift({ value: SUBTITLE_AUTOMATIC_VALUE, label: t('player.automatic'), track: null });
      return choices;
    }

    function automaticPlaybackVersion(playback) {
      var versions = playback && playback.mediaVersions || [];
      var settings = currentSettings();
      var selected;
      if (VersionSelection && typeof VersionSelection.selectAutomatic === 'function') {
        selected = VersionSelection.selectAutomatic(versions, call(dataPorts.playbackCapabilities) || {}, playback && (playback.requestedPlaybackMode || playback.options && playback.options.playbackMode) || 'auto', settings.videoVersionPriorities);
      }
      return selected || versions[0] || null;
    }

    function playbackVersionChoice(playback) {
      var preference = call(detailPorts.preferenceSnapshot) || {};
      var override = preference.override || {};
      var versions = playback && playback.mediaVersions || [];
      var resolved;
      if (!override.versionSignature) { return 'auto'; }
      resolved = playback && playback.options && MediaChoiceModel && MediaChoiceModel.findVersion
        ? MediaChoiceModel.findVersion(versions, MediaChoiceModel.versionValue(playback.options))
        : null;
      if (resolved && VersionSelection && typeof VersionSelection.matchesAffinity === 'function' &&
          VersionSelection.matchesAffinity(resolved, override.versionSignature)) {
        return MediaChoiceModel.versionValue(resolved);
      }
      return 'auto';
    }

    function changeSelectedPlaybackVersion(version) {
      if (!version || !playbackController) { return; }
      playbackController.changeVersion({
        mediaIndex: version.mediaIndex,
        partIndex: version.partIndex,
        media: version.media,
        part: version.part,
        apply: false
      });
    }

    function applySelectedPlaybackVersion(version) {
      if (!version || !playbackController) { return; }
      detailPorts.setPlaybackVersion(version.mediaIndex, version.partIndex);
      changeSelectedPlaybackVersion(version);
    }

    function setPlaybackVersionChoice(value) {
      var playback = currentPlayerPlayback();
      var versions = playback && playback.mediaVersions || [];
      var version = MediaChoiceModel.findVersion(versions, value);
      if (String(value) === 'auto') {
        detailPorts.setPlaybackVersion(null, null);
        changeSelectedPlaybackVersion(automaticPlaybackVersion(playback));
      } else if (version) { applySelectedPlaybackVersion(version); }
    }

    function openPlayerSettingChoiceForKey(key) {
      var rows = playerSettingRows();
      var current = playerControlsSnapshot();
      var row = rows[current.settingIndex];
      var playback = currentPlayerPlayback();
      var choices = [];
      var selected = '';
      var versions;
      var preferenceSnapshot;
      var override;
      if (!row || row.disabled || !key || !playback) { return; }
      if (key === 'subtitle-advanced') { openSubtitleEditor(); return; }
      if (key === 'media-info') { openPlayerMediaInfo(); return; }
      if (key === 'audio' || key === 'subtitles') {
        preferenceSnapshot = call(detailPorts.preferenceSnapshot) || {};
        override = preferenceSnapshot.override || {};
      }
      if (key === 'audio') {
        choices = playerTrackChoices(playback.audioTracks, false);
        selected = override.audioTrack ? playback.options.audioStreamID : SUBTITLE_AUTOMATIC_VALUE;
      } else if (key === 'subtitles') {
        choices = playerTrackChoices(playback.subtitleTracks, true);
        selected = SUBTITLE_AUTOMATIC_VALUE;
        if (override.subtitlesOff) { selected = SUBTITLE_OFF_VALUE; }
        else if (override.subtitleTrack) { selected = playback.options.subtitleStreamID; }
      } else if (key === 'size') {
        choices = subtitleSizeValues().map(function (size) { return { value: String(size), label: size + '%' }; }); selected = String(playback.options.subtitleSize);
      } else if (key === 'version') {
        versions = playback.mediaVersions || [];
        choices = [{ value: 'auto', label: mediaVersionLabel(automaticPlaybackVersion(playback), true), version: null }].concat(MediaChoiceModel.versionChoices(versions, function (version) { return mediaVersionLabel(version, false); }));
        selected = playbackVersionChoice(playback);
      } else if (key === 'quality') {
        choices = ['original', '12000', '8000', '4000'].map(function (value) { return { value: value, label: settingsPorts.videoQualityLabel(value) }; });
        selected = playback.requestedVideoQuality || playback.options.videoQuality;
      } else if (key === 'playback-mode') {
        choices = ['auto', 'direct', 'transcode'].map(function (value) { return { value: value, label: settingsPorts.playbackPreferenceLabel(value) }; });
        selected = playback.requestedPlaybackMode || playback.options.playbackMode;
      }
      openChoiceDialog(row.firstChild.textContent, choices, selected, function (choice) {
        if (playerControlsController) { playerControlsController.applySettingChoice(key, choice.value); }
      }, function () { updateSettingsDisplay(); });
    }

    function mediaVersionLabelForPlayback(playbackValue) {
      var playback = playbackValue || currentPlayerPlayback();
      var versions = playback && playback.mediaVersions || [];
      var version = playback ? MediaChoiceModel.findVersion(versions, MediaChoiceModel.versionValue(playback.options)) : null;
      return playbackVersionChoice(playback) === 'auto'
        ? mediaVersionLabel(automaticPlaybackVersion(playback), true)
        : (version ? mediaVersionLabel(version, false) : t('player.versionAuto'));
    }

    function cyclePlaybackVersion(direction) {
      var playback = currentPlayerPlayback();
      var versions = playback && playback.mediaVersions || [];
      var index = 0;
      var currentIndex;
      var selected = playbackVersionChoice(playback);
      if (!playback || versions.length < 2) { return; }
      if (selected !== 'auto') {
        for (currentIndex = 0; currentIndex < versions.length; currentIndex += 1) {
          if (MediaChoiceModel.versionValue(versions[currentIndex]) === selected) { index = currentIndex + 1; break; }
        }
      }
      index = (index + (direction < 0 ? -1 : 1) + versions.length + 1) % (versions.length + 1);
      if (index === 0) { setPlaybackVersionChoice('auto'); }
      else { applySelectedPlaybackVersion(versions[index - 1]); }
    }

    // Player surface, error/resume overlays, settings, and subtitle editor presentation.
    // Native playback lifecycle and subtitle synchronization are owned by PlaybackController.
    function playbackSnapshot() {
      return playbackController ? playbackController.snapshot() : { active: false, playback: null, subtitleEditor: { open: false } };
    }

    /** @returns {PloffPlaybackPublicSnapshot} */
    function publicPlaybackSnapshot() {
      var source = playbackSnapshot();
      var result = copyRecord(source) || {};
      result.playback = copyPlaybackRecord(source.playback);
      result.localSubtitle = copyRecord(source.localSubtitle);
      result.subtitleEditor = copyRecord(source.subtitleEditor) || { open: false };
      return result;
    }

    function subtitleEditorSnapshot() {
      return playbackSnapshot().subtitleEditor || { open: false };
    }

    function setSubtitleEditorPanelOpen(open) {
      var controls = document.getElementById('player-controls');
      var settings = document.getElementById('player-settings');
      var editor = document.getElementById('subtitle-editor');
      subtitlePanelTransitionTimer = clearOwnedTimer(subtitlePanelTransitionTimer);
      if (open) {
        setPlayerPanelOverlayPosition(true);
        controls.style.transition = 'opacity 100ms linear';
        settings.style.transition = 'opacity 100ms linear';
        controls.style.opacity = '0';
        controls.style.pointerEvents = 'none';
        settings.style.opacity = '0';
        settings.style.pointerEvents = 'none';
        subtitlePanelTransitionTimer = scheduleOwned(function () {
          subtitlePanelTransitionTimer = null;
          settings.className = 'player-settings is-hidden';
          settings.setAttribute('aria-hidden', 'true');
          editor.className = 'subtitle-editor is-transitioning-in';
          if (playerSubtitleEditorController) {
            playerSubtitleEditorController.setViewOpen(true);
            playerSubtitleEditorController.render();
          }
        }, settingsPorts.animationDuration(100));
        return;
      }
      editor.className = 'subtitle-editor is-transitioning-out';
      subtitlePanelTransitionTimer = scheduleOwned(function () {
        subtitlePanelTransitionTimer = null;
        if (playerSubtitleEditorController) { playerSubtitleEditorController.setViewOpen(false); }
        settings.className = 'player-settings';
        settings.setAttribute('aria-hidden', 'false');
        controls.style.transition = 'opacity 100ms linear';
        settings.style.transition = 'opacity 100ms linear';
        controls.style.opacity = '0';
        controls.style.pointerEvents = 'none';
        settings.style.opacity = '1';
        settings.style.pointerEvents = '';
        playerControlsController.setSettingsSignature(currentPlayerSettingsSignature());
        playerControlsController.resumeSettings();
        updateSettingsDisplay(playerControlsSnapshot());
      }, settingsPorts.animationDuration(100));
    }

    function updateSubtitleEditorPresentation(stateValue) {
      if (playerSubtitleEditorController) { playerSubtitleEditorController.update(stateValue); }
    }

    function openSubtitleEditor() {
      return playerSubtitleEditorController ? playerSubtitleEditorController.open() : false;
    }

    function handleSubtitleEditorKey(event, direction) {
      return destroyed || !playerSubtitleEditorController ? false : playerSubtitleEditorController.handleKey(event, direction);
    }

    function applyPlayerSettings() {
      if (!playbackController) { return; }
      playbackController.changeVersion({ kind: 'apply-settings' }, function (error) {
        if (error) { diagnosticsPorts.setError(error); showPlayerError(false); return; }
        saveDetailMediaOverride();
        updateSettingsDisplay();
      });
    }

    function currentPlayerSettingsSignature() {
      var playback = currentPlayerPlayback();
      if (!playback) { return ''; }
      return [
        playback.options.audioStreamID || '', playback.options.subtitleStreamID || '', playback.options.subtitleSize || 100,
        playback.options.mediaIndex === undefined ? '' : playback.options.mediaIndex,
        playback.options.partIndex === undefined ? '' : playback.options.partIndex,
        playback.requestedVideoQuality || playback.options.videoQuality || 'original',
        playback.requestedPlaybackMode || playback.options.playbackMode || 'auto'
      ].join('|');
    }

    function settingsSignatureWithoutSubtitleSize(signature) {
      var parts = String(signature || '').split('|');
      if (parts.length > 2) { parts[2] = ''; }
      return parts.join('|');
    }

    function setPlayerPanelOverlayPosition(open) {
      var view = document.getElementById('player-view');
      var className;
      if (!view) { return; }
      className = view.className.replace(/\s*has-player-panel-open/g, '');
      view.className = className + (open ? ' has-player-panel-open' : '');
    }

    function applyPlayerSettingsOpen(open) {
      var controls = document.getElementById('player-controls');
      var settings = document.getElementById('player-settings');
      subtitlePanelTransitionTimer = clearOwnedTimer(subtitlePanelTransitionTimer);
      if (open) {
        setPlayerPanelOverlayPosition(true);
        updateSettingsDisplay(playerControlsSnapshot());
        settings.className = 'player-settings is-hidden';
        settings.setAttribute('aria-hidden', 'true');
        controls.style.transition = 'opacity 100ms linear';
        controls.style.opacity = '0';
        controls.style.pointerEvents = 'none';
        subtitlePanelTransitionTimer = scheduleOwned(function () {
          subtitlePanelTransitionTimer = null;
          settings.style.opacity = '1'; settings.style.pointerEvents = ''; settings.className = 'player-settings is-transitioning-in'; settings.setAttribute('aria-hidden', 'false');
          updateSettingsDisplay(playerControlsSnapshot());
        }, settingsPorts.animationDuration(100));
      } else {
        settings.className = 'player-settings is-transitioning-out';
        subtitlePanelTransitionTimer = scheduleOwned(function () {
          subtitlePanelTransitionTimer = null;
          settings.className = 'player-settings is-hidden'; settings.setAttribute('aria-hidden', 'true'); settings.style.opacity = ''; settings.style.pointerEvents = '';
          controls.style.transition = 'opacity 100ms linear'; controls.style.opacity = '1'; controls.style.pointerEvents = '';
          setPlayerPanelOverlayPosition(false);
          updatePlayerButtonFocus();
        }, settingsPorts.animationDuration(100));
      }
    }

    function setSettingsOpen(open) { return playerControlsController.setSettingsOpen(open); }
    function playerDisplayTitle(detail) {
      var subtitle = detail.subtitle || '';
      var episodeTitle;
      var episodeMarker;
      var titleMarker;
      if (detail.type === 'episode') {
        episodeTitle = subtitle;
        episodeMarker = subtitle.indexOf(' - E');
        titleMarker = episodeMarker === -1 ? -1 : subtitle.indexOf(' - ', episodeMarker + 3);
        if (titleMarker !== -1) { episodeTitle = subtitle.substring(titleMarker + 3); }
        subtitle = 'S' + Number(detail.seasonIndex || 0) + ' E' + Number(detail.episodeIndex || 0) + (episodeTitle ? ' - ' + episodeTitle : '');
      }
      return { primary: detail.title || '', secondary: subtitle };
    }

    function renderPlayerTitle(detail) {
      var title = document.getElementById('player-title');
      var display = playerDisplayTitle(detail);
      title.innerHTML = '';
      title.appendChild(element('span', 'player-title-primary', display.primary));
      if (display.secondary) { title.appendChild(element('span', 'player-title-secondary', display.secondary)); }
    }

    function updatePlayerErrorFocus() {
      var buttons = document.querySelectorAll('.player-error-actions button');
      var index;
      for (index = 0; index < buttons.length; index += 1) { buttons[index].className = index === playerErrorIndex ? 'is-focused' : ''; }
      if (buttons[playerErrorIndex]) { buttons[playerErrorIndex].focus(); }
    }

    function showPlayerError(waitingForNetwork, retryAction, fallbackAction) {
      if (destroyed) { return; }
      playerErrorVisible = true;
      playerErrorIndex = 0;
      playerErrorRetryAction = retryAction || null;
      playerErrorFallbackAction = fallbackAction || null;
      if (waitingForNetwork || !diagnosticsPorts.error()) { diagnosticsPorts.setError(t(waitingForNetwork ? 'player.waitingNetwork' : 'player.errorMessage')); }
      setText('player-error-message', t(waitingForNetwork ? 'player.waitingNetwork' : 'player.errorMessage'));
      setText('player-error-settings', t(playerErrorFallbackAction ? 'player.switchToAutomatic' : 'player.settings'));
      document.getElementById('player-error').className = 'player-error';
      document.getElementById('player-error-retry').disabled = !!waitingForNetwork;
      setPlayerLoading(false);
      updatePlayerErrorFocus();
    }

    function hidePlayerError() { if (destroyed) { return; } playerErrorVisible = false; document.getElementById('player-error').className = 'player-error is-hidden'; }

    function retryPlaybackFromError() {
      var retryAction = playerErrorRetryAction;
      hidePlayerError();
      playerErrorRetryAction = null;
      playerErrorFallbackAction = null;
      if (retryAction) { retryAction(); }
    }

    function activatePlayerErrorSecondary() {
      var fallbackAction = playerErrorFallbackAction;
      hidePlayerError();
      playerErrorRetryAction = null;
      playerErrorFallbackAction = null;
      if (fallbackAction) { fallbackAction(); }
      else { setSettingsOpen(true); }
    }

    function handlePlayerErrorKey(event, direction) {
      if (!playerErrorVisible) { return false; }
      if (direction === 'left' || direction === 'right') {
        playerErrorIndex = Math.max(0, Math.min(2, playerErrorIndex + (direction === 'left' ? -1 : 1)));
        if (document.querySelectorAll('.player-error-actions button')[playerErrorIndex].disabled) { playerErrorIndex = direction === 'left' ? 2 : 1; }
        updatePlayerErrorFocus();
      } else if (event.keyCode === 13) {
        if (playerErrorIndex === 0) { retryPlaybackFromError(); }
        else if (playerErrorIndex === 1) { activatePlayerErrorSecondary(); }
        else { hidePlayerError(); playerErrorRetryAction = null; playerErrorFallbackAction = null; closePlayer(); }
      } else if (event.keyCode === 27 || event.keyCode === 461) { hidePlayerError(); closePlayer(); }
      return true;
    }

    function updateResumeChoiceFocus() {
      var buttons = document.querySelectorAll('.resume-choice-actions button');
      var index;
      if (!resumeChoiceState) { return false; }
      for (index = 0; index < buttons.length; index += 1) { buttons[index].className = index === resumeChoiceState.index ? 'is-focused' : ''; }
      if (!(pointerSelectionActive()) && buttons[resumeChoiceState.index]) { buttons[resumeChoiceState.index].focus(); }
      return true;
    }

    function renderResumeChoice() {
      setText('resume-choice-title', t('player.resumeTitle'));
      setText('resume-choice-resume', t('player.resumeFrom', { time: formatLongTime(resumeChoiceState.offset) }));
      setText('resume-choice-restart', t('player.playFromBeginning'));
      setText('resume-choice-cancel', t('player.cancel'));
      updateResumeChoiceFocus();
    }

    function showPlayerSurface() {
      setAppView('player'); hidePlayerError(); shellPorts.stopTheme(); resetSkipPrompt(); initializePlayerControlsHidden();
      if (detailPorts) { detailPorts.hideSurface(); }
      document.getElementById('player-view').className = 'player-view';
      document.getElementById('player-view').style.backgroundImage = 'none';
    }

    function cancelResumeChoice() {
      resumeChoiceState = null;
      document.getElementById('resume-choice').className = 'resume-choice is-hidden';
      document.getElementById('resume-choice').setAttribute('aria-hidden', 'true');
      if (typeof restoreContainerDirectPlayOrigin === 'function' && restoreContainerDirectPlayOrigin()) { return; }
      document.getElementById('player-view').className = 'player-view is-hidden';
      standaloneDetailState = null;
      enterDetailView(); detailPorts.showSurface({ restoreTheme: true });
    }

    function startCurrentPlayback(startOffset, versionAffinity) {
      var detailState = detailSnapshot();
      var detail = detailState.currentDetail;
      if (!detail || !playbackController) { return false; }
      playbackQueueController.resetPlaybackSession();
      cancelAutoplayCountdown(); resetSkipPrompt(); renderPlayerTitle(detail);
      previewEffectiveSubtitleStyle(null);
      call(dataPorts.prefetchCurrentAss, detail, call(detailPorts.selectedMediaProfile), call(detailPorts.resolvedTracks));
      return playbackController.open({
        item: detailState.selectedItem || detail,
        detail: detail,
        startOffset: startOffset,
        preferences: detailPlaybackPreferences(versionAffinity),
        versionAffinity: versionAffinity
      });
    }

    function beginPlayer(startOffset) {
      showPlayerSurface();
      if (typeof completeContainerDirectPlayStart === 'function') { completeContainerDirectPlayStart(); }
      resumeChoiceState = null;
      document.getElementById('resume-choice').className = 'resume-choice is-hidden';
      document.getElementById('resume-choice').setAttribute('aria-hidden', 'true');
      startCurrentPlayback(startOffset);
    }

    function activateResumeChoice() {
      var result = ResumeChoice.select(resumeChoiceState);
      if (result.action === 'cancel') { cancelResumeChoice(); return; }
      beginPlayer(result.offset);
    }

    function handleResumeChoiceKey(event, direction) {
      if (!resumeChoiceState) { return false; }
      if (direction === 'left' || direction === 'right') { resumeChoiceState = ResumeChoice.move(resumeChoiceState, direction === 'left' ? -1 : 1); renderResumeChoice(); }
      else if (event.keyCode === 13 || event.keyCode === 415) { activateResumeChoice(); }
      else if (event.keyCode === 27 || event.keyCode === 461) { ResumeChoice.cancel(); cancelResumeChoice(); }
      return true;
    }

    function openPlayer(state) {
      var detailState = state || detailSnapshot();
      var detail = detailState.currentDetail;
      if (currentView() === 'detail' && (!detail || !detail.ratingKey || detail.type === 'show' || detail.type === 'season')) {
        detailPorts.setPlayPending(true); return;
      }
      if (!detail || !detail.ratingKey) { showMessage(t('status.metadataUnavailable')); return; }
      detailPorts.setPlayPending(false);
      resumeChoiceState = ResumeChoice.create(detail.viewOffset);
      if (!resumeChoiceState.visible) { beginPlayer(null); return; }
      showPlayerSurface();
      document.getElementById('resume-choice').className = 'resume-choice'; document.getElementById('resume-choice').setAttribute('aria-hidden', 'false'); renderResumeChoice();
    }

    function openStandalone(request) {
      var detail = request && request.detail;
      var item = request && (request.item || request.detail);
      if (destroyed || !detail || !detail.ratingKey) { return false; }
      standaloneDetailState = {
        selectedItem: item || detail,
        currentDetail: detail,
        seriesContext: null,
        seasonIndex: 0,
        episodeIndex: 0
      };
      if (request && request.resume === false) {
        detailPorts.setPlayPending(false);
        beginPlayer(0);
      } else {
        openPlayer();
      }
      return currentView() === 'player' || resumeChoiceState !== null;
    }

    function queueGapRangeValue(range, name, fallback) {
      if (!range) { return fallback; }
      if (range[name] !== undefined) { return Number(range[name]); }
      return Number(fallback);
    }

    function queueGapLabels(confirmation) {
      var kind = confirmation && confirmation.kind || 'combined';
      var season = Number(confirmation && (confirmation.targetSeasonNumber || confirmation.target && confirmation.target.seasonNumber) || 0);
      var episode = Number(confirmation && (confirmation.targetEpisodeNumber || confirmation.target && confirmation.target.episodeNumber) || 0);
      var bodyKey = kind === 'season' ? 'player.queueGapSeason' : (kind === 'episode' ? 'player.queueGapEpisode' : 'player.queueGapCombined');
      return {
        title: t('player.queueGapTitle'),
        body: t(bodyKey, {
          seasonStart: queueGapRangeValue(confirmation && confirmation.missingSeasons, 'start', ''),
          seasonEnd: queueGapRangeValue(confirmation && confirmation.missingSeasons, 'end', ''),
          episodeStart: queueGapRangeValue(confirmation && confirmation.missingEpisodes, 'start', ''),
          episodeEnd: queueGapRangeValue(confirmation && confirmation.missingEpisodes, 'end', ''),
          season: season,
          episode: episode
        }),
        targetMeta: t('player.queueGapTargetMeta', { season: season, episode: episode }),
        stay: t('player.queueGapStay'),
        proceed: t('player.queueGapContinue')
      };
    }

    function renderQueueGap(snapshot) {
      if (queueGapView) { queueGapView.render(snapshot || { open: false }, queueGapLabels(snapshot && snapshot.confirmation)); }
    }

    function invalidateQueueGap() {
      queueGapSource = '';
      queueGapGeneration = 0;
      if (queueGapController) { queueGapController.invalidate(); }
    }

    function openQueueGap(confirmation, source) {
      if (!queueGapController || !confirmation || queueGapOpen() || !queueGapController.open(confirmation)) { return false; }
      queueGapSource = String(source || 'manual');
      queueGapGeneration = generation;
      return true;
    }

    function queueGapOpen() { return !!(queueGapController && queueGapController.isOpen && queueGapController.isOpen()); }

    function handleAdjacentResolution(error, result, source) {
      if (destroyed) { return; }
      if (error) {
        diagnosticsPorts.setError(error);
        setText('player-status', t('status.streamError'));
        showMessage(t('status.metadataUnavailable'));
        return;
      }
      if (!result || result.state === 'unavailable') { return; }
      if (result.state === 'confirmation-required') {
        openQueueGap(result.confirmation, source);
        return;
      }
      if (result.state === 'available') {
        playbackQueueController.requestResolved(result, {
          origin: source === 'up-next' ? 'up-next' : 'queue',
          versionAffinity: playlistQueueVersionAffinity()
        });
      }
    }

    function switchPlayerEpisode(direction) {
      if (!playbackQueueController||queueGapOpen()) { return false; }
      playbackQueueController.resolveAdjacentState(direction, function (error, result) {
        handleAdjacentResolution(error, result, 'manual');
      }, detailQueueSnapshot());
      return true;
    }

    function hideEndPauseOverlay() {
      var overlay = document.getElementById('player-end-pause');
      if (!overlay) { return; }
      overlay.className = 'player-end-pause is-hidden';
      overlay.setAttribute('aria-hidden', 'true');
    }

    function showEndPauseOverlay() {
      var overlay = document.getElementById('player-end-pause');
      if (!overlay || !playbackAtEnd || currentView() !== 'player') { return false; }
      setText('player-end-pause', t('player.pause'));
      overlay.className = 'player-end-pause';
      overlay.setAttribute('aria-hidden', 'false');
      playerControlsController.initializeHidden();
      return true;
    }

    function restorePlayerSurfaceAfterClose(destination) {
      invalidateQueueGap();
      cancelAutoplayCountdown(); resetSkipPrompt(); resetChapterDrawer(); playerQueueController.close(false);
      playbackAtEnd = false;
      hideEndPauseOverlay();
      subtitlePanelTransitionTimer = clearOwnedTimer(subtitlePanelTransitionTimer);
      containerDirectPlayTransitionTimer = clearOwnedTimer(containerDirectPlayTransitionTimer);
      if (playerSubtitleEditorController) { playerSubtitleEditorController.hideSurface(); }
      document.getElementById('player-controls').style.opacity = '';
      document.getElementById('player-controls').style.pointerEvents = '';
      document.getElementById('player-controls').style.transition = '';
      document.getElementById('player-settings').style.opacity = '';
      document.getElementById('player-settings').style.pointerEvents = '';
      document.getElementById('player-settings').style.transition = '';
      resumeChoiceState = null;
      document.getElementById('resume-choice').className = 'resume-choice is-hidden';
      document.getElementById('resume-choice').setAttribute('aria-hidden', 'true');
      setPlayerLoading(false); hidePlayerError(); playerErrorRetryAction = null; playerErrorFallbackAction = null;
      playerControlsController.reset(); document.getElementById('player-settings').className = 'player-settings is-hidden'; document.getElementById('player-settings').setAttribute('aria-hidden', 'true');
      document.getElementById('player-view').className = 'player-view is-hidden';
      resetNextAssTarget();
      call(dataPorts.cancelAssPrefetch, 'player closed');
      call(settingsPorts.restoreSubtitleStyle, currentSettings());
      standaloneDetailState = null;
      if (destination === 'home') {
        playbackQueueController.clear();
        detailPorts.leave();
        call(statePorts.enterHome);
        return;
      }
      if (typeof restoreContainerDirectPlayOrigin === 'function' && restoreContainerDirectPlayOrigin()) { return; }
      if (restoreContainerPlaybackOrigin()) { return; }
      enterDetailView(); detailPorts.resumeAfterPlayer(new Date().getTime() + 700);
    }

    function closePlayer(destination) {
      diagnosticsPorts.capturePlayback();
      playerControlsController.cancelControlsTimeout();
      if (!playbackController) { restorePlayerSurfaceAfterClose(destination); return; }
      playbackController.close(function () { restorePlayerSurfaceAfterClose(destination); });
    }

    function closePlayerToHome() {
      hideEndPauseOverlay();
      closePlayer('home');
    }
    function playlistQueuePlayable(items) {
      return PlaybackQueueModel.playableItems(items);
    }

    function playlistQueueSeriesContext(context) {
      return PlaybackQueueModel.seriesContext(context);
    }

    function seriesPlaybackTarget(queue, target, existingContext) {
      var context;
      var key;
      if (!queue || queue.kind !== 'series' || !target) { return null; }
      context = { playlistQueue: false, seasons: [], episodes: [], type: 'show' };
      existingContext = existingContext || {};
      for (key in existingContext) {
        if (Object.prototype.hasOwnProperty.call(existingContext, key)) { context[key] = existingContext[key]; }
      }
      context.playlistQueue = false;
      context.seasons = existingContext.seasons || [];
      context.episodes = target.queueEpisodes || [];
      context.type = existingContext.type || 'show';
      return {
        context: context,
        seasonIndex: Number(target.queueSeasonIndex || 0),
        episodeIndex: Number(target.queueEpisodeIndex || 0)
      };
    }

    function playbackQueueContainerKind(container) {
      return PlaybackQueueModel.containerKind(container);
    }


    function detailQueueSnapshot() {
      var snapshot = detailSnapshot();
      return {
        currentDetail: snapshot.currentDetail,
        seriesContext: snapshot.seriesContext,
        seasonIndex: snapshot.seasonIndex,
        episodeIndex: snapshot.episodeIndex
      };
    }

    function handlePlaybackQueueError(error) {
      if (destroyed) { return; }
      if (currentView() === 'player') {
        diagnosticsPorts.setError(error || t('status.metadataUnavailable'));
        setText('player-status', t('status.streamError'));
        showPlayerError(false, function () {});
      } else {
        failContainerDirectPlayStart(t('status.metadataUnavailable'));
      }
    }

    function applyPlaybackQueueRequest(request) {
      if (destroyed) { return false; }
      var queue;
      var target;
      var activated;
      var context = null;
      var seasonIndex = 0;
      var episodeIndex = 0;
      var existingContext;
      var seriesTarget;
      if (!request || !request.item) { return false; }
      if (!request.detail) {
        playbackQueueController.waitForDetail(request.item.ratingKey, function (error, detail) {
          if (error || !detail) { handlePlaybackQueueError(error); return; }
          request.detail = detail;
          applyPlaybackQueueRequest(request);
        });
        return true;
      }
      queue = request.queue || playbackQueueController.activeQueue(detailPorts.queueSnapshot());
      target = request.item;
      if (queue && queue.kind === 'series') {
        existingContext = detailSnapshot().seriesContext || {};
        seriesTarget = seriesPlaybackTarget(queue, target, existingContext);
        context = seriesTarget.context;
        seasonIndex = seriesTarget.seasonIndex;
        episodeIndex = seriesTarget.episodeIndex;
      } else if (queue) {
        activated = playbackQueueController.activatePlaylist(target.ratingKey, request.index, target, request.occurrenceId);
        if (!activated) { handlePlaybackQueueError(new Error('queue item unavailable')); return false; }
        context = activated.context;
        episodeIndex = activated.index;
      }
      if (currentView() === 'player') {
        detailPorts.setPlaybackContext(request.detail, target, context, seasonIndex, episodeIndex);
        resetSkipPrompt();
        cancelAutoplayCountdown(false);
        detailPorts.queueMediaProfile(request.detail);
        detailPorts.renderEpisodeContext();
        playerQueueController.updateButton();
        previewEffectiveSubtitleStyle(null);
        playbackController.startItem(target, {
          detail: request.detail,
          startOffset: request.resumeOffset || null,
          preferences: detailPlaybackPreferencesFor(request.detail, null),
          versionAffinity: null
        }, function (error) { if (error) { handlePlaybackQueueError(error); } });
        return true;
      }
      detailPorts.openLoaded(request.detail, {
        returnView: 'library',
        selectedItem: target,
        visible: false,
        deferMediaProfile: true,
        skipSeriesLoad: true
      });
      detailPorts.setPlaybackContext(request.detail, target, context, seasonIndex, episodeIndex);
      detailPorts.setPlayPending(false);
      detailPorts.setFocus({ zone: 'play', actionIndex: 0 });
      openPlayer();
      finishContainerDirectPlayTransition();
      playbackQueueController.completeDirect();
      return true;
    }

    function restorePlaybackQueueOrigin(origin, options) {
      if (destroyed) { return false; }
      var queueState = playbackQueueSnapshot();
      var queue = queueState.playlistQueue;
      var restored;
      origin = origin || queueState.containerOrigin;
      restored = libraryPorts.restoreContainerOrigin({
        origin: origin,
        queueItems: queue && queue.items || [],
        queueIndex: queue && queue.index || 0,
        activeItem: queue && (queue.currentItem || queue.items && (queue.items[queue.index] || queue.items[0])) || null,
        onReady: options && options.onReady,
        openUnopened: options && options.openUnopened === true
      });
      if (!restored) { return false; }
      finishContainerDirectPlayTransition();
      detailPorts.leave();
      return true;
    }

    function playbackQueueModel(snapshotValue) {
      return playbackQueueController.activeQueue(snapshotValue || detailQueueSnapshot());
    }

    function resolvePlaybackQueueAdjacent(direction, callback) {
      playbackQueueController.resolveAdjacent(direction, callback, detailQueueSnapshot());
    }

    function playlistQueueCurrentIndex(queue, snapshotValue) {
      return Math.max(0, playbackQueueController.activeIndex(queue, snapshotValue || detailQueueSnapshot()));
    }

    function playlistQueueVersionAffinity() {
      return PlaybackQueueModel.versionAffinity(
        detailPorts.preferenceSnapshot(),
        currentPlayerPlayback(),
        VersionSelection && VersionSelection.signature
      );
    }

    function switchPlayerQueueItem(index, snapshotValue) {
      var detail = snapshotValue || detailQueueSnapshot();
      var queue = playbackQueueModel(detail);
      var currentIndex;
      if (!queue || currentView() !== 'player') { return; }
      currentIndex = playlistQueueCurrentIndex(queue, detail);
      if (Number(index) === Number(currentIndex)) { playerQueueController.close(true); return; }
      playerQueueController.close(false);
      playbackQueueController.requestIndex(index, { versionAffinity: playlistQueueVersionAffinity() }, detail);
    }

    function clearPlaylistPlaybackQueue() {
      if (playerQueueController) { playerQueueController.resetPresentation(); }
      playbackQueueController.clear();
      if (playerQueueController) { playerQueueController.updateButton(); }
    }

    function playlistQueueContainer() {
      var container = libraryPorts.activeContainer();
      return playbackQueueContainerKind(container) ? container : null;
    }

    function preparePlaylistPlaybackQueue(item) {
      var context = libraryPorts.playbackContext();
      var container = context.container;
      if (!container || !item) { return false; }
      return playbackQueueController.prepareContainer(container, context.items || [], item, context.focusIndex, detailQueueSnapshot());
    }

    function activatePlaylistPlaybackQueue(state) {
      var active = playbackQueueController.activatePlaylist(state.currentDetail.ratingKey);
      if (!active) { return false; }
      detailPorts.setPlaylistContext(active.context, active.index);
      playerQueueController.updateButton(null, true);
      return true;
    }

    function finishContainerDirectPlayTransition() {
      if (String(document.body.className || '').indexOf('is-container-direct-start') === -1) { return; }
      containerDirectPlayTransitionTimer = clearOwnedTimer(containerDirectPlayTransitionTimer);
      containerDirectPlayTransitionTimer = scheduleOwned(function () {
        containerDirectPlayTransitionTimer = null;
        document.body.className = document.body.className.replace(/\s*is-container-direct-start/g, '');
      }, 0);
    }

    function beginContainerOriginRestoreTransition() {
      containerOriginRestoreTimer = clearOwnedTimer(containerOriginRestoreTimer);
      containerOriginRestoreGeneration += 1;
      containerOriginRestoreStartedAt = new Date().getTime();
      document.body.className = document.body.className.replace(/\s*is-container-origin-restoring/g, '') + ' is-container-origin-restoring';
      return containerOriginRestoreGeneration;
    }

    function finishContainerOriginRestoreTransition(restoreGeneration) {
      var elapsed = Math.max(0, new Date().getTime() - containerOriginRestoreStartedAt);
      var delay = Math.max(0, 250 - elapsed);
      if (restoreGeneration !== containerOriginRestoreGeneration) { return; }
      containerOriginRestoreTimer = clearOwnedTimer(containerOriginRestoreTimer);
      containerOriginRestoreTimer = scheduleOwned(function () {
        containerOriginRestoreTimer = null;
        containerOriginRestoreStartedAt = 0;
        document.body.className = document.body.className.replace(/\s*is-container-origin-restoring/g, '');
      }, delay);
    }

    function completeContainerDirectPlayStart() {
      playbackQueueController.completeDirect();
    }

    function restoreContainerDirectPlayOrigin() {
      var restored = playbackQueueController.restoreContainerOrigin();
      if (restored) { finishContainerDirectPlayTransition(); }
      return restored;
    }

    function restoreContainerPlaybackOrigin() {
      var queueState = playbackQueueSnapshot();
      var restored;
      var restoreGeneration = beginContainerOriginRestoreTransition();
      restored = restorePlaybackQueueOrigin(queueState.containerOrigin, {
        openUnopened: true,
        onReady: function () { finishContainerOriginRestoreTransition(restoreGeneration); }
      });
      if (!restored) { finishContainerOriginRestoreTransition(restoreGeneration); }
      return restored;
    }

    function failContainerDirectPlayStart(message) {
      restoreContainerDirectPlayOrigin();
      showMessage(message || t('status.metadataUnavailable'));
    }

    function startContainerPlayback(container) {
      var started;
      if (!container || !playbackQueueContainerKind(container) || playbackQueueSnapshot().directPlayPending) { return false; }
      document.body.className = document.body.className.replace(/\s*is-container-direct-start/g, '') + ' is-container-direct-start';
      started = playbackQueueController.startContainer(container, function (error) {
        if (error) { failContainerDirectPlayStart(t('status.libraryUnavailable')); }
      });
      if (!started) { finishContainerDirectPlayTransition(); }
      return started;
    }

    function consumePlaylistEvent(event) {
      if (event.preventDefault) { event.preventDefault(); }
      if (event.stopImmediatePropagation) { event.stopImmediatePropagation(); }
      else if (event.stopPropagation) { event.stopPropagation(); }
    }

    function openPlaylistLibraryItem(item, playImmediately) {
      var token;
      var attempts = 0;
      if (!preparePlaylistPlaybackQueue(item)) { return false; }
      if (!playImmediately) { openDetail(item); return true; }
      token = playbackQueueController.capturePlaylistGeneration();
      openDetail(item);
      function attemptPlayback() {
        var detailState = detailSnapshot();
        if (!playbackQueueController.isPlaylistGenerationCurrent(token) || currentView() !== 'detail') { return; }
        if (detailState.currentDetail && detailState.currentDetail.ratingKey && String(detailState.currentDetail.ratingKey) === String(item.ratingKey)) {
          activatePlaylistPlaybackQueue(detailState);
          openPlayer(detailState);
          return;
        }
        attempts += 1;
        if (attempts < 240) { scheduleOwned(attemptPlayback, 25); }
      }
      scheduleOwned(attemptPlayback, 0);
      return true;
    }

    function clearPlaylistQueueForExternalSelection(button) {
      if (!button) { return; }
      if (button.hasAttribute('data-row-index') || button.hasAttribute('data-search-index') ||
          button.hasAttribute('data-watchlist-index') || button.hasAttribute('data-episode-position') ||
          button.hasAttribute('data-nav-index')) {
        clearPlaylistPlaybackQueue();
      }
    }

    function handlePlaylistQueueKeyCapture(event) {
      var item;
      var view = currentView();
      var queueState = playbackQueueSnapshot();
      var route = {
        view: view,
        keyCode: event.keyCode,
        directPlayPending: !!queueState.directPlayPending,
        drawerOpen: !!(queueState.drawer && queueState.drawer.open)
      };
      var command;
      var controlsState;
      var libraryState;
      var detailState;
      if (route.directPlayPending && view !== 'player') {
        command = InputCommandRouter.playerQueue(route);
        if (command === 'pending-cancel') {
          consumePlaylistEvent(event);
          restoreContainerDirectPlayOrigin();
          return true;
        }
        consumePlaylistEvent(event);
        return true;
      }
      if (view === 'player') {
        if (!route.drawerOpen) {
          controlsState = playerControlsSnapshot();
          route.queueButtonFocused = controlsState.mode === 'full' && controlsState.zone === 'buttons' &&
            playerButtonAction(controlsState.buttonIndex) === 'queue';
        }
      }
      if (view === 'library') {
        libraryState = libraryPorts.snapshot().library;
        route.libraryZone = libraryState.zone;
        if (libraryState.zone === 'grid' && (event.keyCode === 13 || event.keyCode === 415)) {
          item = libraryPorts.focusedItem();
          route.focusedContainerPlayable = !!(item && item.containerKey && playbackQueueContainerKind(item));
          if (!route.focusedContainerPlayable) {
            route.playlistContainerActive = !!playlistQueueContainer();
            route.focusedPlaylistPlayable = !!(item && !item.containerKey && playlistQueuePlayable([item]).length);
          }
        }
      }
      if (view === 'detail') {
        detailState = detailSnapshot();
        route.playlistQueue = !!queueState.playlistQueue;
        route.detailPresent = !!detailState.currentDetail;
        route.detailZone = detailState.zone;
        route.detailActionIndex = detailState.actionIndex;
      }
      command = InputCommandRouter.playerQueue(route);
      if (command === 'pass' && (event.keyCode === 13 || event.keyCode === 415)) {
        route.navigationFocused = navigationHasFocus();
        command = InputCommandRouter.playerQueue(route);
      }
      if (command === 'drawer-consume') {
        consumePlaylistEvent(event);
        return true;
      }
      if (command === 'drawer-up' || command === 'drawer-down') {
        consumePlaylistEvent(event);
        playerQueueController.move(command === 'drawer-up' ? -1 : 1);
        return true;
      }
      if (command === 'drawer-activate') {
        consumePlaylistEvent(event);
        switchPlayerQueueItem(queueState.drawer.index);
        return true;
      }
      if (command === 'drawer-close') {
        consumePlaylistEvent(event);
        playerQueueController.close(true);
        return true;
      }
      if (command === 'drawer-open') {
        consumePlaylistEvent(event);
        playerQueueController.open();
        return true;
      }
      if (command === 'library-start-container') {
        consumePlaylistEvent(event);
        startContainerPlayback(item);
        return true;
      }
      if (command === 'library-open-detail' || command === 'library-open-play') {
        consumePlaylistEvent(event);
        openPlaylistLibraryItem(item, command === 'library-open-play');
        return true;
      }
      if (command === 'detail-activate') {
        if (activatePlaylistPlaybackQueue(detailState)) {
          consumePlaylistEvent(event);
          openPlayer(detailState);
          return true;
        }
        return false;
      }
      if (command === 'clear-pass') {
        clearPlaylistPlaybackQueue();
        return false;
      }
      return false;
    }

    function handlePlaylistQueuePointerClick(event, button) {
      var item;
      var view = currentView();
      var queueState = playbackQueueSnapshot();
      var detailState;
      var queueDetail;
      if (queueState.directPlayPending && view !== 'player') { consumePlaylistEvent(event); return true; }
      if (!button || button.disabled) { return false; }
      if (view === 'player' && button.id === 'player-playlist-queue-button') {
        consumePlaylistEvent(event);
        playerQueueController.open();
        return true;
      }
      if (view === 'player' && queueState.drawer.open && button.hasAttribute('data-playlist-queue-index')) {
        consumePlaylistEvent(event);
        queueDetail = detailQueueSnapshot();
        playbackQueueController.pointDrawer(Number(button.getAttribute('data-playlist-queue-index')), queueDetail);
        switchPlayerQueueItem(playbackQueueController.drawerSnapshot(queueDetail).index, queueDetail);
        return true;
      }
      if (view === 'player' && queueState.drawer.open) { consumePlaylistEvent(event); return true; }
      if (view === 'library' && (button.hasAttribute('data-library-index') || button.hasAttribute('data-library-recommendation-row'))) {
        libraryPorts.pointerFocus('grid', 0, button);
        item = libraryPorts.focusedItem();
        if (playlistQueueContainer() && item && !item.containerKey && playlistQueuePlayable([item]).length) {
          consumePlaylistEvent(event);
          openPlaylistLibraryItem(item, false);
          return true;
        }
        clearPlaylistPlaybackQueue();
        return false;
      }
      if (view === 'detail') {
        detailState = detailSnapshot();
        if (button.id === 'detail-play' && detailState.currentDetail && activatePlaylistPlaybackQueue(detailState)) {
          consumePlaylistEvent(event);
          openPlayer(detailState);
          return true;
        }
      }
      clearPlaylistQueueForExternalSelection(button);
      return false;
    }
    function renderPlaybackQueueUpNext(viewState, seconds) {
      var item = viewState && viewState.item || {};
      var home = item.action === 'home';
      if (destroyed) { return; }
      upNextView.render(viewState || { visible: false }, {
        countdown: t(home ? 'player.homeIn' : 'player.upNextIn', { seconds: Math.max(0, Number(seconds || 0)) }),
        play: t(home ? 'player.goHome' : 'player.playNow'),
        cancel: t('player.cancel')
      });
    }

    function prefetchAutoplayBackdrop(target) {
      var detailState = detailSnapshot();
      var currentKey;
      var source;
      var key;
      var preview;
      if (destroyed || !target || currentSettings().autoplayDelay === 0 || currentView() !== 'player' || !root.Image) { return; }
      currentKey = String(detailState.currentDetail && detailState.currentDetail.ratingKey || '');
      source = artworkUrl(target.item || {});
      key = [currentKey, target.index, source].join('|');
      if (!source || !playbackQueueController.claimBackdropPrefetch(key)) { return; }
      if (autoplayPrefetchImage) {
        autoplayPrefetchImage.onload = null;
        autoplayPrefetchImage.onerror = null;
      }
      preview = new root.Image();
      autoplayPrefetchImage = preview;
      preview.onload = preview.onerror = function () {
        if (autoplayPrefetchImage === preview) { autoplayPrefetchImage = null; }
        preview.onload = null;
        preview.onerror = null;
        preview = null;
      };
      preview.src = imageRequestUrl(source, 640, 360, 'up-next-backdrop');
    }

    function setAutoplayBackdropVisible(visible) {
      var view = document.getElementById('player-view');
      if (!view) { return; }
      view.className = view.className.replace(/\s*has-autoplay-backdrop/g, '');
      if (visible) { view.className += ' has-autoplay-backdrop'; }
    }

    function clearAutoplayBackdrop() {
      if (destroyed) { return; }
      var image = document.getElementById('autoplay-backdrop');
      playbackQueueController.invalidateBackdropLoad();
      shellPorts.cancelImages('up-next-backdrop');
      setAutoplayBackdropVisible(false);
      if (!image) { return; }
      image.className = 'player-up-next-backdrop';
      shellPorts.posterLoader().load(image, { source: '', scope: 'up-next-backdrop' });
    }

    function loadAutoplayBackdrop(item) {
      if (destroyed) { return; }
      var image = document.getElementById('autoplay-backdrop');
      var source = artworkUrl(item || {});
      var token = playbackQueueController.beginBackdropLoad();
      shellPorts.cancelImages('up-next-backdrop');
      setAutoplayBackdropVisible(false);
      if (!image || !source) {
        if (image) { image.className = 'player-up-next-backdrop'; }
        return;
      }
      image.className = 'player-up-next-backdrop';
      shellPorts.posterLoader().load(image, {
        source: source,
        previewWidth: 640,
        previewHeight: 360,
        width: 1920,
        height: 1080,
        priority: 0,
        scope: 'up-next-backdrop',
        onPreview: function () {
          if (!playbackQueueController.isBackdropLoadCurrent(token, true)) { return; }
          image.className = 'player-up-next-backdrop is-ready';
          setAutoplayBackdropVisible(true);
        }
      });
    }

    function cancelAutoplayCountdown(dismiss) {
      playbackQueueController.cancelUpNext(dismiss === true);
    }

    function showCompletedPlayerControls() {
      playerControlsController.holdVisible();
    }

    function confirmAutoplayCountdown() {
      if (!playbackQueueController.confirmUpNext()) { setText('player-status', t('status.ended')); }
    }

    function startAutoplayCountdown() {
      if (queueGapOpen()) { return false; }
      return playbackQueueController.playbackEnded({
        actualEnd: true,
        skipPromptVisible: !!playerControlsSnapshot().skip.visible,
        delay: currentSettings().autoplayDelay,
        layout: currentSettings().upNextLayout
      }, detailQueueSnapshot());
    }


    function handleQueueCapture(event) { return destroyed ? false : handlePlaylistQueueKeyCapture(event); }
    function handleQueueGapKey(event, direction) { return destroyed || !queueGapController ? false : queueGapController.handleKey(event, direction); }
    function handleQueueKey(event, direction) { return destroyed ? false : playbackQueueController.handleKey(event, direction); }
    function handleControlsKey(event, direction) { return destroyed ? false : playerControlsController.handleKey(event, direction); }
        function handleResumeKey(event, direction) { return destroyed ? false : handleResumeChoiceKey(event, direction); }
    function handleErrorKey(event, direction) { return destroyed ? false : handlePlayerErrorKey(event, direction); }
    function pointerCaptureFocus(button) { return destroyed ? false : playerQueueController.pointerFocus(button); }
    function pointerCaptureClick(event, button) { return destroyed ? false : handlePlaylistQueuePointerClick(event, button); }
    function pointerFocus(zone, index) {
      if (destroyed) { return false; }
      if (zone === 'resume') {
        if (!resumeChoiceState) { return false; }
        resumeChoiceState.index = Math.max(0, Math.min(2, Number(index) || 0));
        return updateResumeChoiceFocus();
      }
      return playerControlsController.pointerFocus(zone, index);
    }
    function pointerSubtitleFocus(button) {
      return destroyed || !playerSubtitleEditorController ? false : playerSubtitleEditorController.pointerFocus(button);
    }
    function pointerActivity() { return destroyed ? false : playerControlsController.pointerActivity(); }
    function pointerSeek(seconds) { return destroyed ? false : playerControlsController.pointerSeek(seconds); }
    function resetSeekRepeat() { if (!destroyed) { playerControlsController.resetSeekRepeat(); } }
    function settingRows() { return playerSettingRows(); }
    function settingIndex() { return Number(playerControlsSnapshot().settingIndex || 0); }
    function onVideoClick() {
      if (destroyed || subtitleEditorSnapshot().open) { return false; }
      showPlayerControls();
      return playbackController.toggle();
    }
    function onMediaInfoClosed() {
      if (destroyed || currentView() !== 'player') { return false; }
      playerControlsController.resumeSettings();
      updateSettingsDisplay();
      return true;
    }
    function translateStatic() {
      setText('player-settings-title', t('player.settings'));
      setText('setting-audio-label', t('player.audio'));
      setText('setting-subtitles-label', t('player.subtitles'));
      setText('setting-size-label', t('player.subtitleSize'));
      setText('setting-subtitle-advanced-label', t('player.advancedSubtitles'));
      setText('setting-version-label', t('detail.version'));
      setText('setting-quality-label', t('player.videoQuality'));
      setText('setting-playback-mode-label', t('player.playbackMode'));
      setText('player-settings-close', t('common.close'));
      setText('player-track-audio-label', t('player.audio') + ': ');
      setText('player-track-subtitles-label', t('player.subtitles') + ': ');
      setText('playback-info-file-label', t('player.infoFile'));
      setText('playback-info-size-label', t('player.infoSize'));
      setText('playback-info-source-label', t('player.infoSource'));
      setText('playback-info-hdr-label', t('player.infoHdr'));
      setText('playback-info-mode-label', t('player.infoMode'));
      setText('autoplay-play', t('player.playNow'));
      setText('autoplay-cancel', t('player.cancel'));
      setText('player-end-pause', t('player.pause'));
      setText('player-error-title', t('player.errorTitle'));
      setText('player-error-retry', t('player.retry'));
      setText('player-error-settings', t('player.settings'));
      setText('player-error-back', t('player.back'));
      setText('player-chapters-hint-label', t('player.chapters'));
      setText('player-chapters-title', t('player.chapters'));
      document.getElementById('player-previous').setAttribute('aria-label', t('player.previous'));
      document.getElementById('player-next').setAttribute('aria-label', t('player.next'));
      document.getElementById('player-timeline-button').setAttribute('aria-label', t('player.timeline'));
      document.getElementById('player-settings-button').setAttribute('aria-label', t('player.settings'));
      setText('subtitle-editor-title', t('player.advancedSubtitles'));
      setText('subtitle-editor-track-label', t('player.subtitles'));
      setText('subtitle-editor-size-label', t('player.subtitleSize'));
      setText('subtitle-editor-background-label', t('settings.subtitleBackground'));
      setText('subtitle-editor-edge-label', t('settings.subtitleEdge'));
      setText('subtitle-editor-render-srt-label', t('settings.subtitleRenderingSrt'));
      setText('subtitle-editor-render-ass-label', t('settings.subtitleRenderingAss'));
      setText('subtitle-editor-loop-label', t('player.subtitleLoop'));
      setText('subtitle-editor-reset-label', t('player.subtitleReset'));
      setText('subtitle-editor-apply-season-label', t('player.subtitleApplySeason'));
      setText('subtitle-editor-apply-label', t('player.subtitleApply'));
      setText('subtitle-editor-cancel-label', t('player.cancel'));
    }
    function featureSnapshot() {
      return {
        playback: publicPlaybackSnapshot(),
        queue: queueSnapshot(),
        controls: playerControlsSnapshot(),
        resumeChoiceOpen: resumeChoiceState !== null,
        queueGapOpen: !!queueGapOpen(),
        errorOpen: playerErrorVisible,
        subtitleEditorOpen: subtitleEditorSnapshot().open,
        destroyed: destroyed,
        generation: generation
      };
    }
    function playbackDiagnostics() { return playbackController ? playbackController.diagnostics() : {}; }
    function queueSnapshot() { return copyQueueSnapshot(playbackQueueSnapshot()); }
    function controlsSnapshot() { return playerControlsSnapshot(); }

    function destroy() {
      var cleanupError = null;
      function release(callback) {
        try { callback(); } catch (error) { if (!cleanupError) { cleanupError = error; } }
      }
      function releaseOwner(owner) { if (owner && owner.destroy) { release(function () { owner.destroy(); }); } }
      if (destroyed) { return; }
      destroyed = true;
      generation += 1;
      resetNextAssTarget();
      // A failed constructor has never owned a playback/prefetch session.
      if (initialized) { release(function () { call(dataPorts.cancelAssPrefetch, 'player destroyed'); }); }
      while (ownedTimers.length) { release(function () { clearOwnedTimer(ownedTimers[ownedTimers.length - 1]); }); }
      subtitlePanelTransitionTimer = null;
      containerDirectPlayTransitionTimer = null;
      containerOriginRestoreTimer = null;
      containerOriginRestoreGeneration += 1;
      if (autoplayPrefetchImage) {
        autoplayPrefetchImage.onload = null;
        autoplayPrefetchImage.onerror = null;
        autoplayPrefetchImage = null;
      }
      while (eventListeners.length) {
        release(function () {
          var entry = eventListeners.pop();
          if (entry.target && entry.target.removeEventListener) { entry.target.removeEventListener(entry.name, entry.handler, entry.options); }
        });
      }
      fixedClickTargets.forEach(function (target) { release(function () { target.onclick = null; }); });
      fixedClickTargets = [];
      episodeCommandGeneration += 1;
      standaloneDetailState = null;
      if (initialized && shellPorts.cancelImages) { release(function () { shellPorts.cancelImages('up-next-backdrop'); }); }
      playerErrorRetryAction = null;
      releaseOwner(playerControlsController);
      releaseOwner(playerSubtitleEditorController);
      releaseOwner(playbackController);
      releaseOwner(playerQueueController);
      releaseOwner(playbackQueueController);
      releaseOwner(queueGapController);
      if (cleanupError) { throw cleanupError; }
    }

    requireCreate(PlaybackQueueController, 'PlaybackQueueController');
    requireCreate(PlaybackController, 'PlaybackController');
    requireCreate(PlayerControlsController, 'PlayerControlsController');
    requireCreate(PlayerSubtitleEditorController, 'PlayerSubtitleEditorController');
    requireCreate(PlayerQueueController, 'PlayerQueueController');
    if (!UpNextView || typeof UpNextView.create !== 'function') { throw new Error('PlayerFeatureController requires UpNextView'); }
    requireCreate(QueueGapController, 'QueueGapController');
    requireCreate(QueueGapView, 'QueueGapView');
    try {
      upNextView = UpNextView.create({
        document: document,
        ProgressiveImages: ProgressiveImages,
        resolveImageUrl: function (source, width, height) { return imageRequestUrl(source, width, height, 'up-next-card'); }
      });
      queueGapView = QueueGapView.create({
        document: document,
        ProgressiveImages: ProgressiveImages,
        resolveImageUrl: function (source, width, height) { return imageRequestUrl(source, width, height, 'queue-gap'); }
      });
      queueGapController = QueueGapController.create({
        isValid: function (confirmation) {
          return !destroyed && queueGapGeneration === generation && playbackQueueController &&
            playbackQueueController.isConfirmationCurrent(confirmation);
        },
        onState: renderQueueGap,
        onConfirm: function (target) {
          var source = queueGapSource;
          queueGapSource = '';
          queueGapGeneration = 0;
          playbackQueueController.requestResolved(target, {
            origin: source === 'up-next' ? 'up-next' : 'queue',
            versionAffinity: playlistQueueVersionAffinity()
          });
        },
        onCancel: function () {
          var source = queueGapSource;
          queueGapSource = '';
          queueGapGeneration = 0;
          if (source === 'up-next') {
            playbackQueueController.cancelUpNext(true);
            showCompletedPlayerControls();
          }
        }
      });
      playbackQueueController = PlaybackQueueController.create({
        root: root,
        PlaybackQueueModel: PlaybackQueueModel,
        QueueSequenceContract: QueueSequenceContract,
        BoundedQueueCache: BoundedQueueCache,
        SeriesQueueProvider: SeriesQueueProvider,
        PlexContainerQueueProvider: PlexContainerQueueProvider,
        UpNextState: UpNextState,
        UpNextTiming: UpNextTiming,
        currentDetailSnapshot: detailQueueSnapshot,
        queueLabel: function () { return playerQueueController.label(); },
        loadSeasonEpisodes: function (season, callback) { return PlexClient.loadSeasonEpisodes(config, season.ratingKey, '', callback); },
        loadContainerPage: function (container, start, size, callback) { return PlexClient.loadLibraryContainerPage(config, container, start, size, callback); },
        loadMetadata: function (ratingKey, callback) { return PlexClient.loadMetadata(config, ratingKey, callback); },
        requestPlayback: applyPlaybackQueueRequest,
        onPlaybackError: handlePlaybackQueueError,
        onQueueChanged: function () { invalidateQueueGap(); if (playerQueueController) { playerQueueController.updatePresentation(); } },
        onDrawerState: function (snapshot) { if (playerQueueController) { playerQueueController.renderDrawerState(snapshot); } },
        onRestoreOrigin: restorePlaybackQueueOrigin,
        autoplaySettings: function () { return { delay: currentSettings().autoplayDelay, layout: currentSettings().upNextLayout }; },
        playerActive: function () { return currentView() === 'player'; },
        endOfQueueTarget: function () {
          return {
            action: 'home',
            item: { action: 'home', title: t('nav.home'), imageUrl: 'ploff-logo.svg' }
          };
        },
        requestHome: closePlayerToHome,
        upNextItem: function (target, layout) {
          var item = target && (target.item || target) || {};
          if (target && target.action === 'home') {
            return {
              action: 'home',
              title: item.title || t('nav.home'),
              imageUrl: item.imageUrl || 'ploff-logo.svg'
            };
          }
          var source = layout === 'bottom-panel'
            ? (item.art || item.image || item.thumb || '')
            : (item.image || item.thumb || item.art || '');
          return {
            ratingKey: item.ratingKey,
            title: item.type === 'episode' && item.detail ? item.detail : item.title,
            parentTitle: item.parentTitle || item.meta,
            grandparentTitle: item.grandparentTitle || (item.type === 'episode' ? item.title : ''),
            imageSource: source
          };
        },
        renderUpNext: renderPlaybackQueueUpNext,
        loadUpNextBackdrop: loadAutoplayBackdrop,
        clearUpNextBackdrop: clearAutoplayBackdrop,
        resetSkipPrompt: resetSkipPrompt,
        onUpNextCancelled: function (target) {
          if (target && target.action === 'home') { showEndPauseOverlay(); }
          else { showCompletedPlayerControls(); }
        },
        onUpNextRearmed: function () {
          playbackAtEnd = false;
          hideEndPauseOverlay();
          playerControlsController.resumeAutoHide();
        },
        onGapRequired: function (confirmation, source) { openQueueGap(confirmation, source); },
        versionAffinity: playlistQueueVersionAffinity,
        closePlayer: closePlayer
      });
      playerQueueController = PlayerQueueController.create({
        root: root,
        document: document,
        PlaybackQueueModel: PlaybackQueueModel,
        ProgressiveImages: ProgressiveImages,
        queueController: playbackQueueController,
        detailSnapshot: detailQueueSnapshot,
        playbackSnapshot: playbackSnapshot,
        currentView: currentView,
        currentSettings: currentSettings,
        pointerActive: pointerSelectionActive,
        translate: t,
        element: element,
        posterLoader: function () { return typeof shellPorts.posterLoader === 'function' ? shellPorts.posterLoader() : null; },
        loadRenderedPoster: loadRenderedPoster,
        cancelImages: function (scope) { return call(shellPorts.cancelImages, scope); },
        showMessage: showMessage,
        closeChapterDrawer: closeChapterDrawer,
        cancelAutoplay: cancelAutoplayCountdown,
        showControls: showPlayerControls,
        cancelControlsTimeout: function () { if (playerControlsController) { playerControlsController.cancelControlsTimeout(); } },
        setControlsZone: function (zone, index) { if (playerControlsController) { playerControlsController.setZone(zone, index); } },
        animationDuration: settingsPorts.animationDuration
      });
      playbackController = PlaybackController.create({
        root: root,
        document: document,
        video: document.getElementById('player-video'),
        config: config,
        storage: storage,
        PlexClient: PlexClient,
        PlaybackClock: PlaybackClock,
        PlaybackRecovery: PlaybackRecovery,
        NativeVideoDriver: NativeVideoDriver,
        PlaybackReposition: PlaybackReposition,
        PlaybackSession: PlaybackSession,
        PlaybackTimeline: PlaybackTimeline,
        SubtitleRuntime: SubtitleRuntime,
        PlaybackStrategy: PlaybackStrategy,
        PlayerSeekController: PlayerSeekController,
        PlayerTimelinePolicy: PlayerTimelinePolicy,
        PlayerBufferingIndicator: PlayerBufferingIndicator,
        SubtitleSync: SubtitleSync,
        SubtitleEditorSession: SubtitleEditorSession,
        SubtitleOffsetStore: SubtitleOffsetStore,
        subtitlePresentation: function (current, track) { return subtitlePresentation(track, current); },
        AssSubtitleRenderer: AssSubtitleRenderer,
        AssSubtitlePrefetch: dataPorts.AssSubtitlePrefetch,
        assSubtitlePrefetchIdentity: dataPorts.assSubtitlePrefetchIdentity,
        subtitleRendering: function () {
          var presentation = effectiveSubtitlePresentation(currentPlayerPlayback());
          return {
            srt: presentation.renderSrt === true,
            ass: presentation.renderAss === true
          };
        },
        capabilities: function () { return call(dataPorts.playbackCapabilities) || {}; },
        isActive: function () { return currentView() === 'player'; },
        isOffline: function () { return root.navigator && root.navigator.onLine === false; },
        subscribeNetwork: function (listener) { return dataPorts.subscribeNetwork(listener); },
        networkAvailable: function (snapshot) { return snapshot && snapshot.lanAvailable !== false; },
        playbackPreferences: function (request) { return detailPlaybackPreferences(request && request.versionAffinity); },
        resolveVersionTracks: function (current) {
          return detailPorts ? detailPorts.resolvePlaybackTracks(current) : null;
        },
        subtitleIdentity: function () { return activeServerIdentity(); },
        translate: t,
        setStatus: function (key) {
          if (key === 'playing' || key === 'paused') {
            setText('player-status', '');
            return;
          }
          var keys = {
            preparing: 'status.preparing', playing: 'status.playing', paused: 'status.paused', ended: 'status.ended',
            'stream-error': 'status.streamError', 'track-error': 'status.trackError',
            'waiting-network': 'player.waitingNetwork', 'playback-error': 'status.playbackError'
          };
          setText('player-status', t(keys[key] || 'status.preparing'));
        },
        setLoading: setPlayerLoading,
        renderProgress: updatePlayerDisplay,
        updateEstimatedEnd: updateEstimatedEndTime,
        renderPlaybackInfo: renderPlaybackInfo,
        renderSubtitleOverlay: function (cues, positionMs, offsetMs, size) {
          if (playerSubtitleEditorController) { playerSubtitleEditorController.renderOverlay(cues, positionMs, offsetMs, size); }
        },
        hideSubtitleOverlay: function () { if (playerSubtitleEditorController) { playerSubtitleEditorController.hideOverlay(); } },
        onOpening: function () {
          if (destroyed) { return; }
          generation += 1;
          resetNextAssTarget();
          playbackAtEnd = false;
          if (playerQueueController) { playerQueueController.resetPlaybackState(); }
          hideEndPauseOverlay();
          invalidateQueueGap();
          playbackQueueController.resetPlaybackSession();
          cancelAutoplayCountdown();
          resetSkipPrompt();
          hidePlayerError();
        },
        onPlaybackLoaded: function (playback, request) {
          var settingsWereOpen;
          if (destroyed) { return; }
          settingsWereOpen = !!(playerControlsController && playerControlsController.snapshot().settingsOpen);
          playbackAtEnd = false;
          hideEndPauseOverlay();
          resetNextAssTarget();
          setPlaybackIdentity(playback && (playback.ratingKey || playback.session) || null);
          renderPlayerTitle(detailSnapshot().currentDetail || request.detail || playback);
          renderPlaybackInfo();
          updateEpisodeCommands();
          playerQueueController.updateButton();
          playbackQueueModel();
          playerControlsController.setSettingsSignature(currentPlayerSettingsSignature());
          if (settingsWereOpen) { updateSettingsDisplay(); }
          else {
            playerControlsController.setZone('buttons', 1);
            initializePlayerControlsHidden();
          }
        },
        onState: function (snapshot) {
          var remaining;
          if (destroyed) { return; }
          remaining = Number(snapshot.durationSeconds || 0) - Number(snapshot.positionSeconds || 0);
          if (playbackAtEnd && isFinite(remaining) && remaining > 1.5) {
            playbackAtEnd = false;
            hideEndPauseOverlay();
          }
          playbackQueueController.observePlayback(snapshot.positionSeconds, snapshot.durationSeconds);
          maybePrefetchNextAss(snapshot);
          if (queueGapSource === 'up-next' && Number(snapshot.durationSeconds || 0) - Number(snapshot.positionSeconds || 0) >= 5) { invalidateQueueGap(); }
          updatePlayerDisplay(snapshot.positionSeconds, snapshot.durationSeconds, snapshot);
          playerQueueController.updatePlaybackMarkers(snapshot.paused === true);
          updateSubtitleEditorPresentation(snapshot.subtitleEditor);
          renderPlayerPlaybackSummary();
        },
        onEnded: function () {
          if (destroyed) { return; }
          playbackAtEnd = true;
          setPlayerLoading(false);
          if (standaloneDetailState) { showCompletedPlayerControls(); return; }
          startAutoplayCountdown();
        },
        onClosed: function (position, reported, ratingKey) {
          if (destroyed) { return; }
          playbackAtEnd = false;
          hideEndPauseOverlay();
          if (!playbackController.snapshot().active) { setPlaybackIdentity(null); }
          if (reported) {
            applyLocalPlaybackProgress(ratingKey, position);
            call(libraryPorts.refreshAfterPlayback, ratingKey, position);
          }
          call(detailPorts.refreshPlaybackState, ratingKey, position);
        },
        onError: function (error) { if (!destroyed && error) { diagnosticsPorts.setError(error); } },
        onDirectPlaybackFailure: function (error, retryAction, switchToAutomaticAction) {
          if (!destroyed) { showPlayerError(false, retryAction, switchToAutomaticAction); }
        },
        showError: showPlayerError,
        hideError: hidePlayerError,
        onTrackChanged: function () {
          if (destroyed) { return; }
          nextAssPrefetchKey = '';
          call(dataPorts.cancelAssPrefetch, 'subtitle selection changed');
          updateSettingsDisplay();
        },
        onVersionChanged: function () {
          if (destroyed) { return; }
          nextAssPrefetchKey = '';
          call(dataPorts.cancelAssPrefetch, 'media version changed');
          updateSettingsDisplay();
        },
        onSettingsApplied: function () { if (!destroyed) { updateSettingsDisplay(); saveDetailMediaOverride(); } },
        onSubtitleEditorState: function (snapshot) { if (!destroyed) { updateSubtitleEditorPresentation(snapshot); } },
        onSubtitleUnavailable: function () { if (!destroyed) { showMessage(t('player.subtitleSyncUnavailable')); } },
        resolveAdjacent: function (direction, callback) {
          var requestGeneration = generation;
          resolvePlaybackQueueAdjacent(direction, function (target) {
            var item;
            if (destroyed || requestGeneration !== generation) { return; }
            item = target && (target.item || target.episode || target);
            if (!item || !item.ratingKey) { callback(null, null); return; }
            PlexClient.loadMetadata(config, item.ratingKey, function (error, detail) {
              if (destroyed || requestGeneration !== generation) { return; }
              if (error || !detail) { callback(error || null, null); return; }
              callback(null, { item: item, detail: detail, queueTarget: target, versionAffinity: null });
            });
          });
        },
        onAdjacentStarted: function (target) {
          if (destroyed) { return; }
          var queueTarget = target && target.queueTarget;
          var detail = target && target.detail;
          var item = target && target.item;
          var queue = queueTarget && queueTarget.queue;
          var seriesTarget = seriesPlaybackTarget(queue, item, detailSnapshot().seriesContext);
          var context = seriesTarget ? seriesTarget.context : (queue ? playlistQueueSeriesContext(queue) : null);
          var seasonIndex = seriesTarget ? seriesTarget.seasonIndex : 0;
          var episodeIndex = seriesTarget ? seriesTarget.episodeIndex : (queueTarget && Number(queueTarget.index || 0));
          if (!detail) { return; }
          detailPorts.setPlaybackContext(detail, item || detail, context, seasonIndex, episodeIndex);
          detailPorts.queueMediaProfile(detail);
          detailPorts.renderEpisodeContext();
          renderPlayerTitle(detail);
          playerQueueController.updateButton();
        }
      });
      playerSubtitleEditorController = PlayerSubtitleEditorController.create({
        platform: { document: document },
        modules: {
          SubtitleSync: SubtitleSync,
          SubtitleStyleDialog: SubtitleStyleDialog,
          SubtitleEditorView: SubtitleEditorView,
          Settings: Settings,
          MediaInfo: MediaInfo
        },
        playback: {
          snapshot: playbackSnapshot,
          availability: function (streamId) { return playbackController.subtitleEditorAvailability(streamId); },
          open: function (editorOptions) { return playbackController.openSubtitleEditor(editorOptions); },
          apply: function (editorOptions, callback) { return playbackController.applySubtitleEditor(editorOptions, callback); },
          cancel: function (callback) { return playbackController.cancelSubtitleEditor(callback); },
          toggle: function () { return playbackController.toggle(); }
        },
        settings: {
          current: currentSettings,
          previewStyle: settingsPorts.previewSubtitleStyle,
          restoreStyle: settingsPorts.restoreSubtitleStyle,
          commitRendering: settingsPorts.commitSubtitleRendering
        },
        presentation: {
          t: t,
          setText: setText,
          trackLabel: trackLabel,
          subtitleSizes: subtitleSizeValues,
          formatTime: formatTime,
          pointerActive: pointerSelectionActive,
          seasonAvailable: function (playbackValue) {
            return !!SubtitleSeriesOffset && !!SubtitleSeriesOffset.seasonRatingKey(subtitlePresentationDetail(playbackValue));
          },
          load: loadSubtitlePresentation,
          save: saveSubtitlePresentation,
          reset: resetSubtitlePresentation,
          finish: saveDetailMediaOverride,
          reportError: function (error) { diagnosticsPorts.setError(error); },
          setPanelOpen: setSubtitleEditorPanelOpen,
          openChoice: openChoiceDialog,
          confirmRendering: openRenderingGlobalConfirmation
        }
      });

      playerControlsController = PlayerControlsController.create({
        root: root,
        PlayerControlsState: PlayerControlsState,
        ChapterState: ChapterState,
        SkipMarkerState: SkipMarkerState,
        queueController: playbackQueueController,
        now: function () { return new Date().getTime(); },
        playerActive: function () { return currentView() === 'player'; },
        playbackSnapshot: playerControlsPlaybackSnapshot,
        buttonCount: function () { return document.querySelectorAll('.player-button').length; },
        buttonAvailable: playerButtonAvailable,
        buttonAction: playerButtonAction,
        settingsRows: playerSettingsRowsSnapshot,
        settingsSignature: currentPlayerSettingsSignature,
        applySettings: applyPlayerSettings,
        renderMode: function (mode, snapshot) { renderPlayerControlsMode(snapshot); },
        renderFocus: renderPlayerFocusState,
        renderChapters: renderPlayerChaptersState,
        onChaptersClosed: function (restoreFocus) {
          if (restoreFocus) { ensurePlayerChaptersView().markHintReturning(); }
        },
        renderSkip: renderPlayerSkipState,
        renderSettings: updateSettingsDisplay,
        onSettingsOpenChanged: applyPlayerSettingsOpen,
        toggle: function () { playbackController.toggle(); },
        mediaPlay: function () { if (playbackController.snapshot().paused) { playbackController.toggle(); } },
        mediaPause: function () { if (!playbackController.snapshot().paused) { playbackController.toggle(); } },
        seekAbsolute: function (seconds, options) { playbackController.seekAbsolute(seconds, options || {}); },
        startAdjacent: function (direction) { switchPlayerEpisode(direction); },
        changeTrack: applyPlayerTrackChoice,
        changeVersion: function (value) {
          if (typeof value === 'number') { cyclePlaybackVersion(value); }
          else { setPlaybackVersionChoice(value); }
          updateSettingsDisplay();
        },
        changeSetting: applyPlayerSettingChoice,
        openSettingChoice: openPlayerSettingChoiceForKey,
        openSubtitleEditor: function () { openSubtitleEditor(); },
        openMediaInfo: openPlayerMediaInfo,
        openQueue: function () { return playerQueueController.open(); },
        closeQueue: function (restoreFocus) { return playerQueueController.close(restoreFocus); },
        cancelUpNext: function () { cancelAutoplayCountdown(true); },
        closePlayer: closePlayer
      });

      playerQueueController.ensureUi();
      playerQueueController.updateButton();
      bindEvent(document.getElementById('player-video'), 'click', onVideoClick);
      bindClick('player-previous', function () { switchPlayerEpisode(-1); });
      bindClick('player-toggle', playbackController.toggle);
      bindClick('player-next', function () { switchPlayerEpisode(1); });
      bindClick('player-settings-button', function () { setSettingsOpen(true); });
      bindClick('player-media-info', openPlayerMediaInfo);
      bindClick('player-error-retry', retryPlaybackFromError);
      bindClick('player-error-settings', activatePlayerErrorSecondary);
      bindClick('player-error-back', function () { hidePlayerError(); playerErrorRetryAction = null; playerErrorFallbackAction = null; closePlayer(); });
      bindClick('autoplay-play', confirmAutoplayCountdown);
      bindClick('autoplay-cancel', function () { cancelAutoplayCountdown(true); });
      bindClick('queue-gap-stay', function () { queueGapController.cancel(); });
      bindClick('queue-gap-continue', function () { queueGapController.confirm(); });

      translateStatic();
      initialized = true;
    } catch (error) {
      try { destroy(); } catch (_cleanupError) { /* Preserve the construction failure after best-effort rollback. */ }
      throw error;
    }

    return {
      open: openPlayer,
      openStandalone: openStandalone,
      handleQueueCapture: handleQueueCapture,
      handleQueueGapKey: handleQueueGapKey,
      handleQueueKey: handleQueueKey,
      handleControlsKey: handleControlsKey,
      handleResumeKey: handleResumeKey,
      handleErrorKey: handleErrorKey,
      handleSubtitleEditorKey: handleSubtitleEditorKey,
      pointerCaptureFocus: pointerCaptureFocus,
      pointerCaptureClick: pointerCaptureClick,
      pointerFocus: pointerFocus,
      pointerSubtitleFocus: pointerSubtitleFocus,
      pointerActivity: pointerActivity,
      pointerSeek: pointerSeek,
      resetSeekRepeat: resetSeekRepeat,
      settingRows: settingRows,
      settingIndex: settingIndex,
      onMediaInfoClosed: onMediaInfoClosed,
      translateStatic: translateStatic,
      playbackSnapshot: publicPlaybackSnapshot,
      playbackDiagnostics: playbackDiagnostics,
      queueSnapshot: queueSnapshot,
      controlsSnapshot: controlsSnapshot,
      snapshot: featureSnapshot,
      destroy: destroy
    };
  }

  return { create: create };
}));
