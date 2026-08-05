(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffPlayerFeatureController = factory(); }
}(this, function () {
  'use strict';

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
    var PlayerControlsController = modules.PlayerControlsController;
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
    var SubtitleEditorView = modules.SubtitleEditorView;
    var SubtitleOffsetStore = modules.SubtitleOffsetStore;
    var VersionSelection = modules.VersionSelection;
    var MediaInfo = modules.MediaInfo;
    var MediaProfile = modules.MediaProfile;
    var MediaChoiceModel = modules.MediaChoiceModel;
    var ProgressiveImages = modules.ProgressiveImages;
    var UpNextState = modules.UpNextState;
    var UpNextTiming = modules.UpNextTiming;
    var UpNextView = modules.UpNextView;
    var formatTime = PlayerTimelinePolicy && PlayerTimelinePolicy.formatTime ? PlayerTimelinePolicy.formatTime : function (value) { return String(value || 0); };
    var formatLongTime = PlayerTimelinePolicy && PlayerTimelinePolicy.formatLongTime ? PlayerTimelinePolicy.formatLongTime : formatTime;
    var destroyed = false;
    var generation = 0;
    var playbackQueueController = null;
    var queueGapController = null;
    var queueGapView = null;
    var queueGapSource = '';
    var queueGapGeneration=0,queueGapVisible=false;
    var playerControlsController = null;
    var playbackController = null;
    var playlistQueueScrollDirection = 0;
    var playlistQueuePrefetchDirection = { direction: 0, pendingDirection: 0, pendingCount: 0 };
    var playlistQueueCards = {};
    var playlistQueuePrefetchImages = {};
    var playlistQueueRenderToken = 0;
    var playlistQueueSpacers = {};
    var playlistQueueCardOriginIdentity = '';
    var playlistQueuePlaybackPaused = null;
    var playerErrorVisible = false;
    var playerErrorIndex = 0;
    var playerErrorRetryAction = null;
    var resumeChoiceState = null;
    var resumeChoiceVisible = false;
    var playerControlsView = null;
    var playerChaptersView = null;
    var subtitleEditorView = null;
    var subtitleEditorIndex = 0;
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
    function setPlaybackIdentity(identity) { return call(statePorts.setPlaybackIdentity, identity); }
    function pointerSelectionActive() { return call(statePorts.pointerSelectionActive) === true; }
    function navigationHasFocus() { return call(statePorts.navigationHasFocus) === true; }
    function activeServerSnapshot() { return call(dataPorts.activeServer) || null; }
    function activeServerIdentity() {
      var server = activeServerSnapshot();
      return server && (server.machineIdentifier || server.uri) || config.apiBaseUrl || 'local';
    }
    function detailSnapshot() { return call(detailPorts.snapshot) || {}; }
    function detailPlaybackPreferences(versionAffinity) { return call(detailPorts.playbackPreferences, versionAffinity) || {}; }
    function saveDetailMediaOverride() { return call(detailPorts.saveMediaOverride); }
    function applyLocalPlaybackProgress(ratingKey, seconds) { return call(detailPorts.applyLocalPlaybackProgress, ratingKey, seconds); }
    function refreshEpisodePlaybackState(ratingKey, seconds) { return call(detailPorts.refreshPlaybackState, ratingKey, seconds); }
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
      return call(dialogsPorts.openMediaInfo, MediaInfo.create(playerPlayback.mediaProfile, playerPlayback.options || {}, t), 'player');
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

    function subtitleEditorAvailability(playbackValue) {
      var playback = playbackValue || currentPlayerPlayback();
      if (!playback || !SubtitleSync) { return { enabled: false, reason: 'unsupported', track: null }; }
      return SubtitleSync.availability(playback.options.subtitleStreamID, playback.subtitleTracks || [], {});
    }

    function subtitleOffsetFor(track, playbackValue) {
      var playback = playbackValue || currentPlayerPlayback();
      var classification;
      var identity;
      if (!playback || !track || !SubtitleSync) { return 0; }
      classification = SubtitleSync.classify(track);
      if (classification.kind === 'external-text') { return Math.round(Number(track.offset || 0)); }
      if (classification.kind !== 'embedded-text' || !SubtitleOffsetStore) { return 0; }
      identity = activeServerIdentity();
      return SubtitleOffsetStore.get(storage, identity, playback.partId, track.id);
    }

    function ensurePlayerControlsView() {
      if (!playerControlsView) { playerControlsView = PlayerControlsView.create({ document: document, setText: setText }); }
      return playerControlsView;
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
        skipPromptDuration: currentSettings().skipPromptDuration
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
      closePlaylistQueueDrawer(false);
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
      document.getElementById('player-timeline-button').className = 'player-timeline-button' + (snapshot.zone === 'timeline' ? ' is-focused' : '');
      skipButton.className = playerSkipMarkerClass(!(snapshot.skip && snapshot.skip.visible), snapshot);
      renderChapterHint(snapshot);
      for (index = 0; index < buttons.length; index += 1) {
        buttons[index].className = buttons[index].className.replace(/\s*is-focused/g, '') + (snapshot.zone === 'buttons' && index === buttonIndex ? ' is-focused' : '');
      }
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
      var advanced = subtitleEditorAvailability(playback);
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
      if (!playback) { return; }
      advanced = subtitleEditorAvailability(playback);
      setText('setting-audio', trackLabel(playback.audioTracks, playback.options.audioStreamID, t('player.automatic')));
      setText('setting-subtitles', subtitleTrackLabelWithOffset(playback));
      setText('setting-size', playback.options.subtitleSize + '%');
      setText('setting-subtitle-advanced', t(advanced.enabled ? 'player.subtitleAvailable' : 'player.subtitleUnsupported'));
      setText('setting-version', mediaVersionLabelForPlayback(playback));
      setText('setting-quality', settingsPorts.videoQualityLabel(playback.requestedVideoQuality || playback.options.videoQuality));
      setText('setting-playback-mode', settingsPorts.playbackPreferenceLabel(playback.requestedPlaybackMode || playback.options.playbackMode));
      renderPlayerPlaybackSummary(playback);
      renderPlaybackInfo(playback);
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

    function renderPlayerSettingsState(snapshot) { updateSettingsDisplay(snapshot); }

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

    function renderPlayerPlaybackSummary(playbackValue) {
      var playback = playbackValue || currentPlayerPlayback();
      if (!playback) {
        setText('player-track-audio', t('player.unavailable'));
        setText('player-track-subtitles', t('subtitle.off'));
        setText('player-quality', '');
        setText('player-delivery-mode', '');
        return;
      }
      setText('player-track-audio', trackLabel(playback.audioTracks, playback.options.audioStreamID, t('player.automatic')));
      setText('player-track-subtitles', subtitleTrackLabelWithOffset(playback));
      setText('player-quality', t('player.quality') + ': ' + settingsPorts.videoQualityLabel(playback.options.videoQuality));
      setText('player-connection-route', settingsPorts.connectionRouteLabel());
      setText('player-delivery-mode', compactPlaybackModeLabel(playback.playbackMode));
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
      setText('playback-info-mode', playbackModeLabel(playback.playbackMode));
      fileNode = document.getElementById('playback-info-file');
      if (fileNode) { fileNode.title = playback.fileName || ''; }
    }

    function cycleTrack(tracks, currentId, direction, allowOff) {
      var ids = allowOff ? [''] : [];
      var index;
      for (index = 0; index < tracks.length; index += 1) { ids.push(tracks[index].id); }
      index = Math.max(0, ids.indexOf(currentId));
      return ids[Math.max(0, Math.min(ids.length - 1, index + direction))] || '';
    }

    function applyPlayerTrackChoice(kind, value) {
      var playback = currentPlayerPlayback();
      var direction = typeof value === 'number' ? value : null;
      var tracks;
      var selected;
      if (!playback || !playbackController) { return; }
      tracks = kind === 'audio' ? playback.audioTracks : playback.subtitleTracks;
      selected = direction === null ? String(value || '') : cycleTrack(
        tracks || [],
        kind === 'audio' ? playback.options.audioStreamID : playback.options.subtitleStreamID,
        direction,
        kind === 'subtitles'
      );
      playbackController.changeTrack(kind, { id: selected, apply: false });
      detailPorts.setTrackPreference(kind, MediaInfo.selectedTrack(tracks, selected), kind === 'subtitles' && !selected);
      updateSettingsDisplay();
    }

    function applyPlayerSettingChoice(key, value) {
      var playback = currentPlayerPlayback();
      var sizes = [75, 100, 125, 150];
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

    function playerTrackChoices(tracks, includeOff) {
      return MediaChoiceModel.trackChoices(tracks, {
        off: includeOff ? { value: '', label: t('subtitle.off') } : null,
        label: function (track) { return MediaProfile.trackDisplayLabel(track, t('detail.external')); }
      });
    }

    function applySelectedPlaybackVersion(version) {
      if (!version || !playbackController) { return; }
      detailPorts.setPlaybackVersion(version.mediaIndex, version.partIndex);
      playbackController.changeVersion({
        mediaIndex: version.mediaIndex,
        partIndex: version.partIndex,
        media: version.media,
        part: version.part,
        apply: false
      });
    }

    function setPlaybackVersionChoice(value) {
      var playback = currentPlayerPlayback();
      var versions = playback && playback.mediaVersions || [];
      var version = MediaChoiceModel.findVersion(versions, value);
      if (version) { applySelectedPlaybackVersion(version); }
    }

    function openPlayerSettingChoiceForKey(key) {
      var rows = playerSettingRows();
      var current = playerControlsSnapshot();
      var row = rows[current.settingIndex];
      var playback = currentPlayerPlayback();
      var choices = [];
      var selected = '';
      var versions;
      if (!row || row.disabled || !key || !playback) { return; }
      if (key === 'subtitle-advanced') { openSubtitleEditor(); return; }
      if (key === 'media-info') { openPlayerMediaInfo(); return; }
      if (key === 'audio') {
        choices = playerTrackChoices(playback.audioTracks, false); selected = playback.options.audioStreamID;
      } else if (key === 'subtitles') {
        choices = playerTrackChoices(playback.subtitleTracks, true); selected = playback.options.subtitleStreamID;
      } else if (key === 'size') {
        choices = [75, 100, 125, 150].map(function (size) { return { value: String(size), label: size + '%' }; }); selected = String(playback.options.subtitleSize);
      } else if (key === 'version') {
        versions = playback.mediaVersions || [];
        choices = MediaChoiceModel.versionChoices(versions, function (version) { return mediaVersionLabel(version, false); });
        selected = MediaChoiceModel.versionValue(playback.options);
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
      return version ? mediaVersionLabel(version, false) : t('player.versionAuto');
    }

    function cyclePlaybackVersion(direction) {
      var playback = currentPlayerPlayback();
      var versions = playback && playback.mediaVersions || [];
      var index = 0;
      var currentIndex;
      if (!playback || versions.length < 2) { return; }
      for (currentIndex = 0; currentIndex < versions.length; currentIndex += 1) {
        if (versions[currentIndex].mediaIndex === playback.options.mediaIndex && versions[currentIndex].partIndex === playback.options.partIndex) { index = currentIndex; break; }
      }
      index = (index + direction + versions.length) % versions.length;
      applySelectedPlaybackVersion(versions[index]);
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

    function ensureSubtitleEditorView() {
      if (!subtitleEditorView) {
        subtitleEditorView = SubtitleEditorView.create({ document: document, setText: setText, SubtitleSync: SubtitleSync });
      }
      return subtitleEditorView;
    }

    function subtitleEditorControls() { return ensureSubtitleEditorView().controls(); }

    function subtitleEditorControlIndex(name) {
      var controls = subtitleEditorControls();
      var index;
      for (index = 0; index < controls.length; index += 1) {
        if (controls[index].getAttribute('data-subtitle-editor') === name) { return index; }
      }
      return -1;
    }

    function moveSubtitleEditorFocus(direction) {
      var rows = [['track'], ['size'], ['timeline'], ['minus', 'plus', 'loop', 'cancel', 'apply']];
      var controls = subtitleEditorControls();
      var current = controls[subtitleEditorIndex] && controls[subtitleEditorIndex].getAttribute('data-subtitle-editor');
      var row = 0;
      var column = 0;
      var targetRow;
      var targetColumn;
      var index;
      for (index = 0; index < rows.length; index += 1) {
        if (rows[index].indexOf(current) !== -1) { row = index; column = rows[index].indexOf(current); break; }
      }
      if (direction === 'left' || direction === 'right') {
        targetColumn = Math.max(0, Math.min(rows[row].length - 1, column + (direction === 'left' ? -1 : 1)));
        subtitleEditorIndex = subtitleEditorControlIndex(rows[row][targetColumn]);
        return;
      }
      targetRow = Math.max(0, Math.min(rows.length - 1, row + (direction === 'up' ? -1 : 1)));
      targetColumn = Math.max(0, Math.min(rows[targetRow].length - 1, column));
      subtitleEditorIndex = subtitleEditorControlIndex(rows[targetRow][targetColumn]);
    }

    function subtitleEditorTracks() {
      var playback = currentPlayerPlayback();
      var ids = [''];
      if (!playback || !SubtitleSync) { return ids; }
      (playback.subtitleTracks || []).forEach(function (track) {
        if (SubtitleSync.classify(track).supported) { ids.push(String(track.id || '')); }
      });
      return ids;
    }

    function subtitleEditorTrackChoices() {
      var playback = currentPlayerPlayback();
      var choices = [{ value: '', label: t('subtitle.off') }];
      if (!playback) { return choices; }
      (playback.subtitleTracks || []).forEach(function (track) {
        if (SubtitleSync.classify(track).supported) {
          choices.push({ value: String(track.id || ''), label: trackLabel(playback.subtitleTracks, track.id, t('subtitle.off')) });
        }
      });
      return choices;
    }

    function updateSubtitleEditorProgress() {
      var current = playbackSnapshot();
      if (!current.durationSeconds) { return 0; }
      return Math.max(0, Math.min(100, current.positionSeconds / current.durationSeconds * 100));
    }

    function renderSubtitleEditor(stateValue) {
      var current = playbackSnapshot();
      var playback = current.playback;
      var state = stateValue || current.subtitleEditor;
      var track;
      if (!state || !state.open || !playback) { return; }
      track = MediaInfo.selectedTrack(playback.subtitleTracks, state.selectedStreamID);
      ensureSubtitleEditorView().render({
        status: state.status || '',
        track: track ? trackLabel(playback.subtitleTracks, track.id, t('subtitle.off')) : t('subtitle.off'),
        size: state.subtitleSize,
        offsetMs: state.offsetMs,
        progress: updateSubtitleEditorProgress(),
        index: subtitleEditorIndex,
        currentTime: formatTime(current.positionSeconds),
        duration: formatTime(current.durationSeconds),
        loop: state.loop,
        pointerActive: !!(pointerSelectionActive())
      });
    }

    function setSubtitleEditorPanelOpen(open) {
      var controls = document.getElementById('player-controls');
      var settings = document.getElementById('player-settings');
      var editor = document.getElementById('subtitle-editor');
      subtitlePanelTransitionTimer = clearOwnedTimer(subtitlePanelTransitionTimer);
      if (open) {
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
          ensureSubtitleEditorView().setOpen(true);
          renderSubtitleEditor();
        }, settingsPorts.animationDuration(100));
        return;
      }
      editor.className = 'subtitle-editor is-transitioning-out';
      subtitlePanelTransitionTimer = scheduleOwned(function () {
        subtitlePanelTransitionTimer = null;
        ensureSubtitleEditorView().setOpen(false);
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
      var state = stateValue || subtitleEditorSnapshot();
      if (state.open) {
        if (document.getElementById('subtitle-editor').className.indexOf('is-hidden') !== -1) { setSubtitleEditorPanelOpen(true); }
        renderSubtitleEditor(state);
      } else if (document.getElementById('subtitle-editor').className.indexOf('is-hidden') === -1) {
        setSubtitleEditorPanelOpen(false);
      }
    }

    function openSubtitleEditor() {
      if (!playbackController || !playbackController.openSubtitleEditor()) { return false; }
      subtitleEditorIndex = 0;
      setSubtitleEditorPanelOpen(true);
      renderSubtitleEditor();
      return true;
    }

    function cycleSubtitleEditorTrack(direction) {
      var state = subtitleEditorSnapshot();
      var tracks = subtitleEditorTracks();
      var index;
      if (!state.open || !tracks.length) { return; }
      index = tracks.indexOf(String(state.selectedStreamID || ''));
      index = (Math.max(0, index) + direction + tracks.length) % tracks.length;
      playbackController.openSubtitleEditor({ action: 'set-track', streamId: tracks[index] });
    }

    function setSubtitleEditorSize(value) {
      if (playbackController) { playbackController.openSubtitleEditor({ action: 'set-size', size: Number(value) }); }
    }

    function cycleSubtitleEditorSize(direction) {
      var state = subtitleEditorSnapshot();
      var sizes = [75, 100, 125, 150];
      var index = sizes.indexOf(Number(state.subtitleSize || 100));
      setSubtitleEditorSize(sizes[Math.max(0, Math.min(sizes.length - 1, index + direction))]);
    }

    function openSubtitleEditorChoice(name) {
      var state = subtitleEditorSnapshot();
      var choices;
      var selected;
      if (name === 'track') { choices = subtitleEditorTrackChoices(); selected = String(state.selectedStreamID || ''); }
      else { choices = [75, 100, 125, 150].map(function (size) { return { value: String(size), label: size + '%' }; }); selected = String(state.subtitleSize || 100); }
      openChoiceDialog(t(name === 'track' ? 'player.subtitles' : 'player.subtitleSize'), choices, selected, function (choice) {
        if (name === 'track') { playbackController.openSubtitleEditor({ action: 'set-track', streamId: choice.value }); }
        else { setSubtitleEditorSize(choice.value); }
      }, function () { renderSubtitleEditor(); });
    }

    function adjustSubtitleEditorOffset(delta) {
      if (playbackController) { playbackController.openSubtitleEditor({ action: 'adjust-offset', delta: delta }); }
    }

    function seekSubtitleEditor(direction) {
      if (playbackController) { playbackController.openSubtitleEditor({ action: 'seek', delta: direction * 10 }); }
    }

    function finishSubtitleEditor() {
      setSubtitleEditorPanelOpen(false);
      saveDetailMediaOverride();
    }

    function closeSubtitleEditor(apply) {
      if (!playbackController) { return; }
      if (apply) {
        playbackController.applySubtitleEditor({}, function (error) {
          if (error) { diagnosticsPorts.setError(error); renderSubtitleEditor(); return; }
          finishSubtitleEditor();
        });
      } else {
        playbackController.cancelSubtitleEditor(function (error) {
          if (error) { diagnosticsPorts.setError(error); }
          finishSubtitleEditor();
        });
      }
    }

    function activateSubtitleEditorControl(name) {
      var state = subtitleEditorSnapshot();
      if (state.applying) { if (name === 'cancel') { closeSubtitleEditor(false); } return; }
      if (name === 'track') { openSubtitleEditorChoice('track'); }
      else if (name === 'size') { openSubtitleEditorChoice('size'); }
      else if (name === 'minus') { adjustSubtitleEditorOffset(-100); }
      else if (name === 'plus') { adjustSubtitleEditorOffset(100); }
      else if (name === 'loop' && state.bounds && state.bounds.end > state.bounds.start) { playbackController.openSubtitleEditor({ action: 'toggle-loop' }); }
      else if (name === 'apply') { closeSubtitleEditor(true); }
      else if (name === 'cancel') { closeSubtitleEditor(false); }
    }

    function handleSubtitleEditorKey(event, direction) {
      var state = subtitleEditorSnapshot();
      var controls;
      var name;
      if (!state.open) { return false; }
      controls = subtitleEditorControls();
      name = controls[subtitleEditorIndex] && controls[subtitleEditorIndex].getAttribute('data-subtitle-editor');
      if (event.keyCode === 27 || event.keyCode === 461) { closeSubtitleEditor(false); return true; }
      if (state.applying) { return true; }
      if (event.keyCode === 415) { if (playbackSnapshot().paused) { playbackController.toggle(); } return true; }
      if (event.keyCode === 19) { if (!playbackSnapshot().paused) { playbackController.toggle(); } return true; }
      if (direction === 'up' || direction === 'down') { moveSubtitleEditorFocus(direction); renderSubtitleEditor(); }
      else if (direction === 'left' || direction === 'right') {
        if (name === 'track') { cycleSubtitleEditorTrack(direction === 'left' ? -1 : 1); }
        else if (name === 'size') { cycleSubtitleEditorSize(direction === 'left' ? -1 : 1); }
        else if (name === 'timeline') { seekSubtitleEditor(direction === 'left' ? -1 : 1); }
        else { moveSubtitleEditorFocus(direction); renderSubtitleEditor(); }
      } else if (event.keyCode === 13) { activateSubtitleEditorControl(name); }
      return true;
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

    function applyPlayerSettingsOpen(open) {
      var controls = document.getElementById('player-controls');
      var settings = document.getElementById('player-settings');
      subtitlePanelTransitionTimer = clearOwnedTimer(subtitlePanelTransitionTimer);
      if (open) {
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
          updatePlayerButtonFocus();
        }, settingsPorts.animationDuration(100));
      }
    }

    function setSettingsOpen(open) { return playerControlsController.setSettingsOpen(open); }
    function togglePlayback() { return playbackController && playbackController.toggle(); }

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

    function showPlayerError(waitingForNetwork, retryAction) {
      if (destroyed) { return; }
      playerErrorVisible = true;
      playerErrorIndex = 0;
      playerErrorRetryAction = retryAction || null;
      if (waitingForNetwork || !diagnosticsPorts.error()) { diagnosticsPorts.setError(t(waitingForNetwork ? 'player.waitingNetwork' : 'player.errorMessage')); }
      setText('player-error-message', t(waitingForNetwork ? 'player.waitingNetwork' : 'player.errorMessage'));
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
      if (retryAction) { retryAction(); }
    }

    function handlePlayerErrorKey(event, direction) {
      if (!playerErrorVisible) { return false; }
      if (direction === 'left' || direction === 'right') {
        playerErrorIndex = Math.max(0, Math.min(2, playerErrorIndex + (direction === 'left' ? -1 : 1)));
        if (document.querySelectorAll('.player-error-actions button')[playerErrorIndex].disabled) { playerErrorIndex = direction === 'left' ? 2 : 1; }
        updatePlayerErrorFocus();
      } else if (event.keyCode === 13) {
        if (playerErrorIndex === 0) { retryPlaybackFromError(); }
        else if (playerErrorIndex === 1) { hidePlayerError(); setSettingsOpen(true); }
        else { hidePlayerError(); closePlayer(); }
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
      resumeChoiceVisible = false; resumeChoiceState = null;
      document.getElementById('resume-choice').className = 'resume-choice is-hidden';
      document.getElementById('resume-choice').setAttribute('aria-hidden', 'true');
      if (typeof restoreContainerDirectPlayOrigin === 'function' && restoreContainerDirectPlayOrigin()) { return; }
      document.getElementById('player-view').className = 'player-view is-hidden';
      setAppView('detail'); detailPorts.showSurface({ restoreTheme: true });
    }

    function startCurrentPlayback(startOffset, versionAffinity) {
      var detailState = detailSnapshot();
      var detail = detailState.currentDetail;
      if (!detail || !playbackController) { return false; }
      playbackQueueController.resetPlaybackSession();
      cancelAutoplayCountdown(); resetSkipPrompt(); renderPlayerTitle(detail);
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
      resumeChoiceVisible = false; resumeChoiceState = null;
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
      if (!resumeChoiceVisible) { return false; }
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
      showPlayerSurface(); resumeChoiceVisible = true;
      document.getElementById('resume-choice').className = 'resume-choice'; document.getElementById('resume-choice').setAttribute('aria-hidden', 'false'); renderResumeChoice();
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
      queueGapVisible=!!(snapshot&&snapshot.open);
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

    function queueGapOpen(){return queueGapVisible;}

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
      cancelAutoplayCountdown(); resetSkipPrompt(); resetChapterDrawer(); closePlaylistQueueDrawer(false);
      playbackAtEnd = false;
      hideEndPauseOverlay();
      subtitlePanelTransitionTimer = clearOwnedTimer(subtitlePanelTransitionTimer);
      containerDirectPlayTransitionTimer = clearOwnedTimer(containerDirectPlayTransitionTimer);
      ensureSubtitleEditorView().setOpen(false); ensureSubtitleEditorView().hideOverlay();
      document.getElementById('player-controls').style.opacity = '';
      document.getElementById('player-controls').style.pointerEvents = '';
      document.getElementById('player-controls').style.transition = '';
      document.getElementById('player-settings').style.opacity = '';
      document.getElementById('player-settings').style.pointerEvents = '';
      document.getElementById('player-settings').style.transition = '';
      resumeChoiceVisible = false; resumeChoiceState = null;
      document.getElementById('resume-choice').className = 'resume-choice is-hidden';
      document.getElementById('resume-choice').setAttribute('aria-hidden', 'true');
      setPlayerLoading(false); hidePlayerError(); playerErrorRetryAction = null;
      playerControlsController.reset(); document.getElementById('player-settings').className = 'player-settings is-hidden'; document.getElementById('player-settings').setAttribute('aria-hidden', 'true');
      document.getElementById('player-view').className = 'player-view is-hidden';
      if (destination === 'home') {
        playbackQueueController.clear();
        detailPorts.leave();
        call(statePorts.enterHome);
        return;
      }
      if (typeof restoreContainerDirectPlayOrigin === 'function' && restoreContainerDirectPlayOrigin()) { return; }
      if (restoreContainerPlaybackOrigin()) { return; }
      setAppView('detail'); detailPorts.resumeAfterPlayer(new Date().getTime() + 700);
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

    function playbackQueueItemDisplayTitle(item) {
      return PlaybackQueueModel.itemDisplayTitle(item);
    }

    function playbackQueueTypeLabel(item) {
      return PlaybackQueueModel.itemTypeLabel(item, currentSettings() && currentSettings().uiLanguage);
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


    function playlistQueueLabel() {
      return String(currentSettings() && currentSettings().uiLanguage || 'en').toLowerCase().indexOf('it') === 0 ? 'Coda' : 'Queue';
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

    function updatePlaybackQueuePresentation() {
      var queueState;
      var identity;
      if (destroyed) { return; }
      queueState = playbackQueueSnapshot();
      identity = String(queueState.sequence && queueState.sequence.identity || '');
      if (identity !== playlistQueueCardOriginIdentity) {
        releasePlaylistQueueCards(null);
        releasePlaylistQueuePrefetchImages(null);
        playlistQueueCardOriginIdentity = identity;
      }
      if (queueState.drawer.open) {
        renderPlaybackQueueDrawerState(queueState.drawer);
      } else {
        updatePlaylistQueueButton(queueState);
      }
    }

    function renderPlaybackQueueDrawerState(snapshot) {
      if (destroyed) { return; }
      var drawer;
      var player;
      var detailState;
      var queue = snapshot && snapshot.queue;
      var currentIndex = Number(snapshot && snapshot.currentIndex || 0);
      ensurePlaylistQueueUi();
      drawer = document.getElementById('player-playlist-queue');
      player = document.getElementById('player-view');
      if (!drawer || !player) { return; }
      if (snapshot && snapshot.open) {
        detailState = detailQueueSnapshot();
        drawer.className = 'player-playlist-queue is-open';
        drawer.setAttribute('aria-hidden', 'false');
        player.className = player.className.replace(/\s*has-playlist-queue-open/g, '') + ' has-playlist-queue-open';
        renderPlaylistQueueDrawer(detailState, queue, currentIndex);
        updatePlaylistQueueDrawerFocus(queue, snapshot, currentIndex);
        resetPlaylistQueueViewportScroll();
      } else {
        drawer.className = 'player-playlist-queue';
        drawer.setAttribute('aria-hidden', 'true');
        player.className = player.className.replace(/\s*has-playlist-queue-open/g, '');
        resetPlaylistQueueViewportScroll();
      }
      updatePlaylistQueueButton({ drawer: snapshot }, !!queue);
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
        updatePlaylistQueueButton();
        playbackController.startItem(target, {
          detail: request.detail,
          startOffset: request.resumeOffset || null,
          preferences: detailPorts.playbackPreferences(request.versionAffinity || null),
          versionAffinity: request.versionAffinity || null
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

    function ensurePlaylistQueueUi() {
      var row;
      var settings;
      var button;
      var drawer;
      var header;
      if (document.getElementById('player-playlist-queue-button')) { return; }
      row = document.querySelector('.player-buttons');
      settings = document.getElementById('player-settings-button');
      if (!row || !settings) { return; }
      button = element('button', 'player-button player-icon-button player-playlist-queue-command is-unavailable');
      button.id = 'player-playlist-queue-button';
      button.type = 'button';
      button.setAttribute('aria-controls', 'player-playlist-queue');
      button.setAttribute('aria-expanded', 'false');
      button.appendChild(element('span', 'playlist-queue-icon-line'));
      button.appendChild(element('span', 'playlist-queue-icon-line'));
      button.appendChild(element('span', 'playlist-queue-icon-line'));
      row.insertBefore(button, settings);
      drawer = element('aside', 'player-playlist-queue');
      drawer.id = 'player-playlist-queue';
      drawer.setAttribute('aria-hidden', 'true');
      header = element('div', 'player-playlist-queue-header');
      header.appendChild(element('h3', 'player-playlist-queue-title'));
      header.appendChild(element('span', 'player-playlist-queue-position'));
      drawer.appendChild(header);
      drawer.appendChild(element('div', 'player-playlist-queue-list'));
      document.getElementById('player-view').appendChild(drawer);
    }

    function playlistQueueCurrentIndex(queue, snapshotValue) {
      return Math.max(0, playbackQueueController.activeIndex(queue, snapshotValue || detailQueueSnapshot()));
    }

    function playlistQueueAvailable() {
      return !!playbackQueueController.activeQueue(detailQueueSnapshot());
    }

    function updatePlaylistQueueButton(queueState, availableValue) {
      var button;
      var available;
      var snapshot = queueState || playbackQueueSnapshot();
      ensurePlaylistQueueUi();
      button = document.getElementById('player-playlist-queue-button');
      if (!button) { return; }
      available = availableValue === undefined ? playlistQueueAvailable() : availableValue;
      button.className = 'player-button player-icon-button player-playlist-queue-command' +
        (available ? '' : ' is-unavailable');
      button.setAttribute('aria-label', playlistQueueLabel());
      button.setAttribute('aria-expanded', snapshot.drawer.open ? 'true' : 'false');
      if (!available && snapshot.drawer.open) { closePlaylistQueueDrawer(false); }
    }

    function playlistQueueNowPlayingClass(current, paused) {
      return 'playlist-queue-card-now-playing' +
        (current ? (paused ? '' : ' is-playing') : ' is-hidden');
    }

    function playlistQueueCardClass(index, currentIndex, focused, viewed) {
      return 'chapter-card playlist-queue-card' +
        (index === currentIndex ? ' is-current' : '') +
        (focused ? ' is-focused' : '') +
        (viewed ? ' is-viewed' : '');
    }

    function playlistQueueViewportItems(list) {
      var height = Math.max(1, Number(list && list.clientHeight || 0));
      return height > 1 ? Math.max(1, Math.ceil(height / 208)) : 5;
    }

    function playlistQueueSdSize() {
      return ProgressiveImages && ProgressiveImages.previewSize
        ? ProgressiveImages.previewSize(390, 148, 96)
        : { width: 96, height: 36 };
    }

    function playlistQueueSpacer(name, count) {
      var spacer = playlistQueueSpacers[name];
      var height;
      if (count <= 0) { return null; }
      if (!spacer) {
        spacer = element('div', 'playlist-queue-spacer ' + name);
        spacer.setAttribute('aria-hidden', 'true');
        playlistQueueSpacers[name] = spacer;
      }
      height = count * 208 + 'px';
      if (spacer.style.height !== height) { spacer.style.height = height; }
      return spacer;
    }

    function reconcilePlaylistQueueNodes(list, desiredNodes) {
      var index;
      var current;
      if (!list) { return; }
      for (index = list.childNodes.length - 1; index >= 0; index -= 1) {
        current = list.childNodes[index];
        if (desiredNodes.indexOf(current) < 0) { list.removeChild(current); }
      }
      for (index = 0; index < desiredNodes.length; index += 1) {
        current = list.childNodes[index] || null;
        if (current !== desiredNodes[index]) { list.insertBefore(desiredNodes[index], current); }
      }
    }

    function loadPlaylistQueueArtwork(image, source, tier, priority) {
      var loader = typeof shellPorts.posterLoader === 'function' ? shellPorts.posterLoader() : null;
      var preview;
      var requestKey;
      if (!image || !source || tier === 'none') { return; }
      requestKey = String(tier) + '|' + String(source);
      if (image.__playlistQueueArtworkKey === requestKey) { return; }
      image.__playlistQueueArtworkKey = requestKey;
      if (tier === 'final') {
        loadRenderedPoster(image, source, priority, 'playlist-queue', 390, 148);
        return;
      }
      if (!loader || !loader.load) { return; }
      preview = playlistQueueSdSize();
      loader.load(image, {
        source: source,
        previewWidth: preview.width,
        previewHeight: preview.height,
        width: preview.width,
        height: preview.height,
        priority: priority,
        scope: 'playlist-queue'
      });
    }

    function playlistQueueCardKey(record, absoluteIndex) {
      return String(record && record.occurrenceId || 'queue-occurrence-' + absoluteIndex);
    }

    function createPlaylistQueueCard() {
      var card = element('button', 'chapter-card playlist-queue-card');
      var imageFrame = element('span', 'playlist-queue-card-image-frame');
      var image = element('img', 'chapter-card-image playlist-queue-card-image');
      var badge = element('span', 'playlist-queue-card-badge');
      var nowPlaying = element('span', 'playlist-queue-card-now-playing');
      var caption = element('span', 'chapter-card-caption playlist-queue-card-caption');
      var title = element('span', 'chapter-card-title playlist-queue-card-title');
      var position = element('span', 'chapter-card-time');
      card.type = 'button';
      image.alt = '';
      nowPlaying.setAttribute('aria-hidden', 'true');
      imageFrame.appendChild(image);
      caption.appendChild(title);
      caption.appendChild(position);
      card.appendChild(imageFrame);
      card.appendChild(badge);
      card.appendChild(nowPlaying);
      card.appendChild(caption);
      card.__playlistQueueImage = image;
      card.__playlistQueueBadge = badge;
      card.__playlistQueueNowPlaying = nowPlaying;
      card.__playlistQueueTitle = title;
      card.__playlistQueuePosition = position;
      return card;
    }

    function releasePlaylistQueueCards(retained) {
      var loader = typeof shellPorts.posterLoader === 'function' ? shellPorts.posterLoader() : null;
      var keys = Object.keys(playlistQueueCards);
      var index;
      var card;
      for (index = 0; index < keys.length; index += 1) {
        if (retained && retained[keys[index]]) { continue; }
        card = playlistQueueCards[keys[index]];
        if (loader && loader.load && card && card.__playlistQueueImage) {
          card.__playlistQueueImage.__playlistQueueArtworkKey = '';
          loader.load(card.__playlistQueueImage, { source: '', scope: 'playlist-queue' });
        }
        delete playlistQueueCards[keys[index]];
      }
    }

    function releasePlaylistQueuePrefetchImages(retained) {
      var loader = typeof shellPorts.posterLoader === 'function' ? shellPorts.posterLoader() : null;
      var keys = Object.keys(playlistQueuePrefetchImages);
      var index;
      var image;
      for (index = 0; index < keys.length; index += 1) {
        if (retained && retained[keys[index]]) { continue; }
        image = playlistQueuePrefetchImages[keys[index]];
        if (loader && loader.load && image) {
          image.__playlistQueuePrefetchKey = '';
          loader.load(image, { source: '', scope: 'playlist-queue-prefetch' });
        }
        delete playlistQueuePrefetchImages[keys[index]];
      }
    }

    function prefetchPlaylistQueueArtwork(records) {
      var loader = typeof shellPorts.posterLoader === 'function' ? shellPorts.posterLoader() : null;
      var preview = playlistQueueSdSize();
      var retained = {};
      var index;
      var record;
      var item;
      var key;
      var image;
      var requestKey;
      if (!loader || !loader.load) {
        releasePlaylistQueuePrefetchImages(null);
        return;
      }
      for (index = 0; index < (records || []).length; index += 1) {
        record = records[index];
        item = record && record.item;
        if (!item || !item.image) { continue; }
        key = playlistQueueCardKey(record, Number(record.absoluteIndex || 0));
        retained[key] = true;
        image = playlistQueuePrefetchImages[key];
        if (!image) {
          image = element('img', 'playlist-queue-prefetch-image');
          playlistQueuePrefetchImages[key] = image;
        }
        requestKey = String(item.image) + '|' + preview.width + 'x' + preview.height;
        if (image.__playlistQueuePrefetchKey === requestKey) { continue; }
        image.__playlistQueuePrefetchKey = requestKey;
        loader.load(image, {
          source: item.image,
          previewWidth: preview.width,
          previewHeight: preview.height,
          width: preview.width,
          height: preview.height,
          priority: 2,
          scope: 'playlist-queue-prefetch'
        });
      }
      releasePlaylistQueuePrefetchImages(retained);
    }

    function setPlaylistQueueText(node, value) {
      value = String(value === null || value === undefined ? '' : value);
      if (node && node.textContent !== value) { node.textContent = value; }
    }

    function setPlaylistQueueClass(node, value) {
      value = String(value || '');
      if (node && node.className !== value) { node.className = value; }
    }

    function setPlaylistQueueAttribute(node, name, value) {
      value = String(value === null || value === undefined ? '' : value);
      if (node && (!node.getAttribute || node.getAttribute(name) !== value)) { node.setAttribute(name, value); }
    }

    function updatePlaylistQueueCard(card, item, absoluteIndex, currentIndex, focused, total, paused) {
      var itemPosition = playbackQueueItemPosition(item, absoluteIndex, total);
      var itemTitle = playbackQueueItemDisplayTitle(item);
      var typeLabel = playbackQueueTypeLabel(item);
      var viewedLabel;
      card.__playlistQueueIsViewed = !!item.viewed;
      viewedLabel = card.__playlistQueueIsViewed ? ', ' + t('library.watched') : '';
      setPlaylistQueueClass(card, playlistQueueCardClass(absoluteIndex, currentIndex, focused, card.__playlistQueueIsViewed));
      setPlaylistQueueAttribute(card, 'data-playlist-queue-index', absoluteIndex);
      setPlaylistQueueAttribute(card, 'aria-label', typeLabel + ', ' + itemTitle + ', ' + itemPosition + viewedLabel);
      setPlaylistQueueText(card.__playlistQueueBadge, typeLabel);
      setPlaylistQueueClass(card.__playlistQueueNowPlaying,
        playlistQueueNowPlayingClass(absoluteIndex === currentIndex, paused));
      setPlaylistQueueText(card.__playlistQueueTitle, itemTitle);
      setPlaylistQueueText(card.__playlistQueuePosition, itemPosition);
    }

    function updatePlaylistQueuePlaybackMarkers(paused) {
      var keys;
      var index;
      var card;
      var current;
      paused = paused === true;
      if (playlistQueuePlaybackPaused === paused) { return; }
      playlistQueuePlaybackPaused = paused;
      keys = Object.keys(playlistQueueCards);
      for (index = 0; index < keys.length; index += 1) {
        card = playlistQueueCards[keys[index]];
        current = (' ' + String(card.className || '') + ' ').indexOf(' is-current ') >= 0;
        setPlaylistQueueClass(card.__playlistQueueNowPlaying, playlistQueueNowPlayingClass(current, paused));
      }
    }

    function scrollPlaylistQueueFocus(direction, card, next) {
      var list = document.querySelector('.player-playlist-queue-list');
      if (!list || !card) { return; }
      list.scrollTop = PlaybackQueueModel.drawerScrollTop({
        scrollTop: list.scrollTop,
        clientHeight: list.clientHeight,
        focusedTop: card.offsetTop,
        focusedHeight: card.offsetHeight,
        nextTop: next ? next.offsetTop : NaN,
        nextHeight: next ? next.offsetHeight : 0,
        direction: direction,
        isLast: !next
      });
    }

    function resetPlaylistQueueViewportScroll() {
      var drawer = document.getElementById('player-playlist-queue');
      var player = document.getElementById('player-view');
      if (root.scrollTo) { root.scrollTo(0, 0); }
      if (document.documentElement) { document.documentElement.scrollLeft = 0; }
      if (document.body) { document.body.scrollLeft = 0; }
      if (player) { player.scrollLeft = 0; }
      if (drawer) { drawer.scrollLeft = 0; }
    }

    function focusPlaylistQueueDrawerCard(card) {
      if (!card || !card.focus) { return; }
      resetPlaylistQueueViewportScroll();
      card.focus();
      resetPlaylistQueueViewportScroll();
    }

    function updatePlaylistQueueDrawerFocus(queueValue, drawerValue, currentIndexValue) {
      var queue = queueValue || playbackQueueModel();
      var drawerState = drawerValue || playbackQueueSnapshot().drawer;
      var keys = Object.keys(playlistQueueCards);
      var currentIndex;
      var cardIndex;
      var index;
      var card;
      var focused = null;
      var next = null;
      if (!queue) { return; }
      currentIndex = currentIndexValue === undefined ? playlistQueueCurrentIndex(queue) : Number(currentIndexValue || 0);
      for (index = 0; index < keys.length; index += 1) {
        card = playlistQueueCards[keys[index]];
        cardIndex = Number(card.getAttribute('data-playlist-queue-index'));
        setPlaylistQueueClass(card, playlistQueueCardClass(cardIndex, currentIndex, cardIndex === drawerState.index, card.__playlistQueueIsViewed));
        if (cardIndex === drawerState.index) { focused = card; }
        else if (cardIndex === drawerState.index + 1) { next = card; }
      }
      scrollPlaylistQueueFocus(playlistQueueScrollDirection, focused, next);
      playlistQueueScrollDirection = 0;
      resetPlaylistQueueViewportScroll();
      if (!(pointerSelectionActive()) && drawerState.focusReady) { focusPlaylistQueueDrawerCard(focused); }
    }

    function playbackQueueItemPosition(item, absoluteIndex, total) {
      return (absoluteIndex + 1) + '/' + total;
    }

    function applyPlaylistQueueDrawerWindow(queue, drawerState, list, title, position, windowResult, direction, currentIndexValue) {
      var currentIndex = Number(currentIndexValue || 0);
      var total = Math.max(0, Number(windowResult && windowResult.total || 0));
      var windowValue = windowResult && windowResult.bounds || PlaybackQueueModel.windowBounds({ total: total });
      var records = windowResult && windowResult.items || [];
      var retainedCards = {};
      var record;
      var absoluteIndex;
      var item;
      var cardKey;
      var card;
      var image;
      var artworkTier;
      var posterLoader = typeof shellPorts.posterLoader === 'function' ? shellPorts.posterLoader() : null;
      var desiredNodes = [];
      var playbackPaused = playbackSnapshot().paused === true;
      var spacer;
      var offset;
      playlistQueuePlaybackPaused = playbackPaused;
      setPlaylistQueueText(title, queue.title || playlistQueueLabel());
      setPlaylistQueueText(position, (currentIndex + 1) + ' / ' + total);
      spacer = playlistQueueSpacer('is-before', windowValue.retainedStart);
      if (spacer) { desiredNodes.push(spacer); }
      for (offset = 0; offset < records.length; offset += 1) {
        record = records[offset];
        absoluteIndex = Number(record && record.absoluteIndex || 0);
        item = record && record.item;
        if (!item) { continue; }
        cardKey = playlistQueueCardKey(record, absoluteIndex);
        retainedCards[cardKey] = true;
        card = playlistQueueCards[cardKey];
        if (!card) {
          card = createPlaylistQueueCard();
          playlistQueueCards[cardKey] = card;
        }
        updatePlaylistQueueCard(card, item, absoluteIndex, currentIndex, absoluteIndex === drawerState.index, total, playbackPaused);
        card.setAttribute('data-playlist-queue-index', absoluteIndex);
        card.setAttribute('data-playlist-queue-occurrence', String(record.occurrenceId || ''));
        desiredNodes.push(card);
        image = card.__playlistQueueImage;
        artworkTier = PlaybackQueueModel.windowTier(windowValue, absoluteIndex);
        if (item.image) { loadPlaylistQueueArtwork(image, item.image, artworkTier, absoluteIndex === drawerState.index ? 0 : 1); }
        else if (posterLoader && posterLoader.load) { posterLoader.load(image, { source: '', scope: 'playlist-queue' }); }
      }
      spacer = playlistQueueSpacer('is-after', total - windowValue.retainedEnd);
      if (spacer) { desiredNodes.push(spacer); }
      reconcilePlaylistQueueNodes(list, desiredNodes);
      releasePlaylistQueueCards(retainedCards);
      prefetchPlaylistQueueArtwork(windowResult && windowResult.prefetchItems || []);
      playlistQueueScrollDirection = direction;
      updatePlaylistQueueDrawerFocus(queue, drawerState, currentIndex);
    }

    function renderPlaylistQueueDrawer(detailStateValue, queueValue, currentIndexValue) {
      var detailState = detailStateValue || detailQueueSnapshot();
      var queue = queueValue || playbackQueueModel(detailState);
      var drawer;
      var list;
      var title;
      var position;
      var currentIndex = currentIndexValue === undefined ? playlistQueueCurrentIndex(queue, detailState) : Number(currentIndexValue || 0);
      var renderToken = playlistQueueRenderToken += 1;
      var direction = playlistQueueScrollDirection;
      ensurePlaylistQueueUi();
      drawer = document.getElementById('player-playlist-queue');
      list = drawer && drawer.querySelector('.player-playlist-queue-list');
      title = drawer && drawer.querySelector('.player-playlist-queue-title');
      position = drawer && drawer.querySelector('.player-playlist-queue-position');
      if (!drawer || !list || !queue) { return; }
      playbackQueueController.loadDrawerWindow({
        viewportItems: playlistQueueViewportItems(list),
        direction: playlistQueuePrefetchDirection.direction
      }, function (error, windowResult) {
        var liveQueueState = playbackQueueSnapshot();
        if (destroyed || renderToken !== playlistQueueRenderToken || !liveQueueState.drawer.open) { return; }
        if (error || !windowResult) {
          showMessage(t('status.libraryUnavailable'));
          return;
        }
        applyPlaylistQueueDrawerWindow(queue, liveQueueState.drawer, list, title, position, windowResult, direction, currentIndex);
      }, detailState);
    }

    function openPlaylistQueueDrawer() {
      if (!playlistQueueAvailable() || currentView() !== 'player') { return; }
      playlistQueueScrollDirection = 0;
      playlistQueuePrefetchDirection = { direction: 0, pendingDirection: 0, pendingCount: 0 };
      ensurePlaylistQueueUi();
      closeChapterDrawer(false);
      cancelAutoplayCountdown(false);
      showPlayerControls();
      playerControlsController.cancelControlsTimeout();
      playbackQueueController.openDrawer(detailQueueSnapshot(), settingsPorts.animationDuration(220));
    }

    function closePlaylistQueueDrawer(restoreFocus) {
      playlistQueueScrollDirection = 0;
      playlistQueuePrefetchDirection = { direction: 0, pendingDirection: 0, pendingCount: 0 };
      playbackQueueController.closeDrawer();
      if (restoreFocus && currentView() === 'player') {
        var buttons = document.querySelectorAll('.player-button');
        var index;
        for (index = 0; index < buttons.length; index += 1) {
          if (buttons[index].id === 'player-playlist-queue-button') { playerControlsController.setZone('buttons', index); break; }
        }
        showPlayerControls();
      }
    }

    function movePlaylistQueueDrawerFocus(direction) {
      playlistQueueScrollDirection = Number(direction) < 0 ? -1 : 1;
      if (PlaybackQueueModel && PlaybackQueueModel.prefetchDirection) {
        playlistQueuePrefetchDirection = PlaybackQueueModel.prefetchDirection(
          playlistQueuePrefetchDirection,
          playlistQueueScrollDirection
        );
      } else {
        playlistQueuePrefetchDirection.direction = playlistQueueScrollDirection;
      }
      playbackQueueController.moveDrawer(direction, detailQueueSnapshot());
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
      if (Number(index) === Number(currentIndex)) { closePlaylistQueueDrawer(true); return; }
      closePlaylistQueueDrawer(false);
      playbackQueueController.requestIndex(index, { versionAffinity: playlistQueueVersionAffinity() }, detail);
    }

    function handlePlaylistQueuePointerFocus(button) {
      if (!playbackQueueSnapshot().drawer.open || !button || !button.hasAttribute('data-playlist-queue-index')) { return false; }
      playbackQueueController.pointDrawer(Number(button.getAttribute('data-playlist-queue-index')), detailQueueSnapshot());
      return true;
    }

    function clearPlaylistPlaybackQueue() {
      releasePlaylistQueueCards(null);
      releasePlaylistQueuePrefetchImages(null);
      playbackQueueController.clear();
      updatePlaylistQueueButton();
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
      updatePlaylistQueueButton(null, true);
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
      var playImmediately;
      var view = currentView();
      var queueState = playbackQueueSnapshot();
      var controlsState;
      var libraryState;
      var detailState;
      if (queueState.directPlayPending && view !== 'player') {
        consumePlaylistEvent(event);
        if (event.keyCode === 27 || event.keyCode === 461) { restoreContainerDirectPlayOrigin(); }
        return true;
      }
      if (view === 'player') {
        if (queueState.drawer.open) {
          consumePlaylistEvent(event);
          if (event.keyCode === 38) { movePlaylistQueueDrawerFocus(-1); }
          else if (event.keyCode === 40) { movePlaylistQueueDrawerFocus(1); }
          else if (event.keyCode === 13) { switchPlayerQueueItem(queueState.drawer.index); }
          else if (event.keyCode === 27 || event.keyCode === 461 || event.keyCode === 37) { closePlaylistQueueDrawer(true); }
          return true;
        }
        controlsState = playerControlsSnapshot();
        if (controlsState.mode === 'full' && controlsState.zone === 'buttons' &&
            playerButtonAction(controlsState.buttonIndex) === 'queue' &&
            event.keyCode === 13) {
          consumePlaylistEvent(event);
          openPlaylistQueueDrawer();
          return true;
        }
      }
      if (view === 'library') {
        libraryState = libraryPorts.snapshot().library;
        if (libraryState.zone === 'grid' && event.keyCode === 415) {
          item = libraryPorts.focusedItem();
          if (item && item.containerKey && playbackQueueContainerKind(item)) {
            consumePlaylistEvent(event);
            startContainerPlayback(item);
            return true;
          }
        }
        if (libraryState.zone === 'grid' && (event.keyCode === 13 || event.keyCode === 415)) {
          item = libraryPorts.focusedItem();
          if (playlistQueueContainer() && item && !item.containerKey && playlistQueuePlayable([item]).length) {
            consumePlaylistEvent(event);
            playImmediately = event.keyCode === 415;
            openPlaylistLibraryItem(item, playImmediately);
            return true;
          }
          clearPlaylistPlaybackQueue();
          return false;
        }
      }
      if (view === 'detail') {
        detailState = detailSnapshot();
        if (queueState.playlistQueue && detailState.currentDetail &&
            (event.keyCode === 13 || event.keyCode === 415) && detailState.zone === 'episodes') {
          clearPlaylistPlaybackQueue();
          return false;
        }
        if (queueState.playlistQueue && detailState.currentDetail &&
            ((event.keyCode === 415 && detailState.zone !== 'episodes') ||
             (event.keyCode === 13 && detailState.zone === 'play' && detailState.actionIndex === 0))) {
          if (activatePlaylistPlaybackQueue(detailState)) {
            consumePlaylistEvent(event);
            openPlayer(detailState);
            return true;
          }
          return false;
        }
      }
      if ((event.keyCode === 13 || event.keyCode === 415) && navigationHasFocus()) {
        clearPlaylistPlaybackQueue();
        return false;
      }
      if ((view === 'home' || view === 'search' || view === 'watchlist') &&
          (event.keyCode === 13 || event.keyCode === 415)) {
        clearPlaylistPlaybackQueue();
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
        openPlaylistQueueDrawer();
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

    function prefetchAutoplayBackdrop() {
      var detailState = detailSnapshot();
      if (destroyed) { return; }
      var currentKey = String(detailState.currentDetail && detailState.currentDetail.ratingKey || '');
      if (currentSettings().autoplayDelay === 0 || currentView() !== 'player' || !root.Image) { return; }
      resolvePlaybackQueueAdjacent(1, function (target) {
        var currentDetailState = detailSnapshot();
        var source;
        var key;
        var preview;
        if (!target || currentView() !== 'player' || String(currentDetailState.currentDetail && currentDetailState.currentDetail.ratingKey || '') !== currentKey) { return; }
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
      });
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
    function pointerCaptureFocus(button) { return destroyed ? false : handlePlaylistQueuePointerFocus(button); }
    function pointerCaptureClick(event, button) { return destroyed ? false : handlePlaylistQueuePointerClick(event, button); }
    function pointerFocus(zone, index) {
      if (destroyed) { return false; }
      if (zone === 'resume') {
        if (!resumeChoiceVisible || !resumeChoiceState) { return false; }
        resumeChoiceState.index = Math.max(0, Math.min(2, Number(index) || 0));
        return updateResumeChoiceFocus();
      }
      return playerControlsController.pointerFocus(zone, index);
    }
    function pointerSubtitleFocus(button) {
      var controls = subtitleEditorControls();
      var index;
      if (destroyed) { return false; }
      for (index = 0; index < controls.length; index += 1) {
        if (controls[index] === button) { subtitleEditorIndex = index; break; }
      }
      renderSubtitleEditor();
      return true;
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
      setText('setting-quality-label', t('settings.videoQuality'));
      setText('setting-playback-mode-label', t('settings.playbackMode'));
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
      setText('subtitle-editor-loop-label', t('player.subtitleLoop'));
      setText('subtitle-editor-apply-label', t('player.subtitleApply'));
      setText('subtitle-editor-cancel-label', t('player.cancel'));
    }
    function featureSnapshot() {
      return {
        playback: publicPlaybackSnapshot(),
        queue: queueSnapshot(),
        controls: playerControlsSnapshot(),
        resumeChoiceOpen: resumeChoiceVisible,
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
      var entry;
      if (destroyed) { return; }
      destroyed = true;
      generation += 1;
      subtitlePanelTransitionTimer = clearOwnedTimer(subtitlePanelTransitionTimer);
      containerDirectPlayTransitionTimer = clearOwnedTimer(containerDirectPlayTransitionTimer);
      containerOriginRestoreTimer = clearOwnedTimer(containerOriginRestoreTimer);
      containerOriginRestoreGeneration += 1;
      while (ownedTimers.length) { clearOwnedTimer(ownedTimers[ownedTimers.length - 1]); }
      if (autoplayPrefetchImage) {
        autoplayPrefetchImage.onload = null;
        autoplayPrefetchImage.onerror = null;
        autoplayPrefetchImage = null;
      }
      while (eventListeners.length) {
        entry = eventListeners.pop();
        if (entry.target && entry.target.removeEventListener) { entry.target.removeEventListener(entry.name, entry.handler, entry.options); }
      }
      fixedClickTargets.forEach(function (target) { target.onclick = null; });
      fixedClickTargets = [];
      episodeCommandGeneration += 1;
      if (shellPorts.cancelImages) {
        shellPorts.cancelImages('playlist-queue');
        shellPorts.cancelImages('playlist-queue-prefetch');
        shellPorts.cancelImages('up-next-backdrop');
      }
      releasePlaylistQueueCards(null);
      releasePlaylistQueuePrefetchImages(null);
      playerErrorRetryAction = null;
      if (playerControlsController && playerControlsController.destroy) { playerControlsController.destroy(); }
      if (playbackController && playbackController.destroy) { playbackController.destroy(); }
      if (playbackQueueController && playbackQueueController.destroy) { playbackQueueController.destroy(); }
      if (queueGapController && queueGapController.destroy) { queueGapController.destroy(); }
    }

    requireCreate(PlaybackQueueController, 'PlaybackQueueController');
    requireCreate(PlaybackController, 'PlaybackController');
    requireCreate(PlayerControlsController, 'PlayerControlsController');
    if (!UpNextView || typeof UpNextView.create !== 'function') { throw new Error('PlayerFeatureController requires UpNextView'); }
    requireCreate(QueueGapController, 'QueueGapController');
    requireCreate(QueueGapView, 'QueueGapView');
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
      queueLabel: playlistQueueLabel,
      loadSeasonEpisodes: function (season, callback) { return PlexClient.loadSeasonEpisodes(config, season.ratingKey, '', callback); },
      loadContainerPage: function (container, start, size, callback) { return PlexClient.loadLibraryContainerPage(config, container, start, size, callback); },
      loadMetadata: function (ratingKey, callback) { return PlexClient.loadMetadata(config, ratingKey, callback); },
      requestPlayback: applyPlaybackQueueRequest,
      onPlaybackError: handlePlaybackQueueError,
      onQueueChanged: function () { invalidateQueueGap(); updatePlaybackQueuePresentation(); },
      onDrawerState: renderPlaybackQueueDrawerState,
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
    playbackController = PlaybackController.create({
      root: root,
      document: document,
      video: document.getElementById('player-video'),
      config: config,
      storage: storage,
      PlexClient: PlexClient,
      PlaybackClock: PlaybackClock,
      PlaybackRecovery: PlaybackRecovery,
      PlaybackStrategy: PlaybackStrategy,
      PlayerSeekController: PlayerSeekController,
      PlayerTimelinePolicy: PlayerTimelinePolicy,
      PlayerBufferingIndicator: PlayerBufferingIndicator,
      SubtitleSync: SubtitleSync,
      SubtitleOffsetStore: SubtitleOffsetStore,
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
        ensureSubtitleEditorView().renderOverlay(cues, positionMs, offsetMs, size);
      },
      hideSubtitleOverlay: function () { ensureSubtitleEditorView().hideOverlay(); },
      onOpening: function () {
        if (destroyed) { return; }
        generation += 1;
        playbackAtEnd = false;
        playlistQueuePlaybackPaused = null;
        hideEndPauseOverlay();
        invalidateQueueGap();
        playbackQueueController.resetPlaybackSession();
        cancelAutoplayCountdown();
        resetSkipPrompt();
        hidePlayerError();
      },
      onPlaybackLoaded: function (playback, request) {
        if (destroyed) { return; }
        playbackAtEnd = false;
        hideEndPauseOverlay();
        setPlaybackIdentity(playback && (playback.ratingKey || playback.session) || null);
        if (request && request.versionAffinity && detailPorts) { detailPorts.setPlaybackVersion(playback.mediaIndex, playback.partIndex); }
        renderPlayerTitle(detailSnapshot().currentDetail || request.detail || playback);
        renderPlaybackInfo();
        updateEpisodeCommands();
        updatePlaylistQueueButton();
        playbackQueueModel();
        prefetchAutoplayBackdrop();
        playerControlsController.setZone('buttons', 1);
        playerControlsController.setSettingsSignature(currentPlayerSettingsSignature());
        initializePlayerControlsHidden();
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
        if (queueGapSource === 'up-next' && Number(snapshot.durationSeconds || 0) - Number(snapshot.positionSeconds || 0) >= 5) { invalidateQueueGap(); }
        updatePlayerDisplay(snapshot.positionSeconds, snapshot.durationSeconds, snapshot);
        updatePlaylistQueuePlaybackMarkers(snapshot.paused === true);
        updateSubtitleEditorPresentation(snapshot.subtitleEditor);
        renderPlayerPlaybackSummary();
      },
      onEnded: function () {
        if (destroyed) { return; }
        playbackAtEnd = true;
        startAutoplayCountdown();
      },
      onClosed: function (position, reported, ratingKey) {
        if (destroyed) { return; }
        playbackAtEnd = false;
        hideEndPauseOverlay();
        if (!playbackController.snapshot().active) { setPlaybackIdentity(null); }
        if (reported) { applyLocalPlaybackProgress(ratingKey, position); }
        refreshEpisodePlaybackState(ratingKey, position);
      },
      onError: function (error) { if (!destroyed && error) { diagnosticsPorts.setError(error); } },
      showError: showPlayerError,
      hideError: hidePlayerError,
      onTrackChanged: function () { if (!destroyed) { updateSettingsDisplay(); } },
      onVersionChanged: function () { if (!destroyed) { updateSettingsDisplay(); } },
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
            callback(null, { item: item, detail: detail, queueTarget: target, versionAffinity: playlistQueueVersionAffinity() });
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
        updatePlaylistQueueButton();
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
      renderSettings: renderPlayerSettingsState,
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
      openQueue: openPlaylistQueueDrawer,
      closeQueue: closePlaylistQueueDrawer,
      cancelUpNext: function () { cancelAutoplayCountdown(true); },
      closePlayer: closePlayer
    });

    ensurePlaylistQueueUi();
    updatePlaylistQueueButton();
    bindEvent(document.getElementById('player-video'), 'click', onVideoClick);
    bindClick('player-previous', function () { switchPlayerEpisode(-1); });
    bindClick('player-toggle', togglePlayback);
    bindClick('player-next', function () { switchPlayerEpisode(1); });
    bindClick('player-settings-button', function () { setSettingsOpen(true); });
    bindClick('player-media-info', openPlayerMediaInfo);
    bindClick('player-error-retry', retryPlaybackFromError);
    bindClick('player-error-settings', function () { hidePlayerError(); setSettingsOpen(true); });
    bindClick('player-error-back', function () { hidePlayerError(); closePlayer(); });
    bindClick('autoplay-play', confirmAutoplayCountdown);
    bindClick('autoplay-cancel', function () { cancelAutoplayCountdown(true); });
    bindClick('queue-gap-stay', function () { queueGapController.cancel(); });
    bindClick('queue-gap-continue', function () { queueGapController.confirm(); });

    return {
      open: openPlayer,
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
      controlsSnapshot: controlsSnapshot,
      snapshot: featureSnapshot,
      destroy: destroy
    };
  }

  return { create: create };
}));
