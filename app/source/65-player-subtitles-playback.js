  // Subtitle synchronization, seek/rebuild, recovery, resume, and lifecycle.
  function copyPlaybackOptions(options) {
    var result = {};
    var key;
    for (key in (options || {})) {
      if (Object.prototype.hasOwnProperty.call(options, key)) { result[key] = options[key]; }
    }
    return result;
  }

  function copyLocalSubtitleState(stateValue) {
    if (!stateValue) { return null; }
    return {
      cues: stateValue.cues,
      offsetMs: stateValue.offsetMs,
      streamId: stateValue.streamId,
      size: stateValue.size
    };
  }

  function subtitleServerIdentity() {
    return activeServer && (activeServer.machineIdentifier || activeServer.uri) || config.apiBaseUrl || 'local';
  }

  function subtitleEditorAvailability() {
    if (!currentPlayback || !SubtitleSync) { return { enabled: false, reason: 'unsupported', track: null }; }
    return SubtitleSync.availability(currentPlayback.options.subtitleStreamID, currentPlayback.subtitleTracks || [], failedSubtitleStreams);
  }

  function subtitleOffsetFor(track) {
    var classification;
    if (!track) { return 0; }
    classification = SubtitleSync.classify(track);
    if (classification.kind === 'external-text') { return Math.round(Number(track.offset || 0)); }
    if (classification.kind === 'embedded-text') {
      return SubtitleOffsetStore.get(root.localStorage, subtitleServerIdentity(), currentPlayback.partId, track.id);
    }
    return 0;
  }

  function rememberSubtitlePreviewOffset(stateValue, track) {
    var id;
    if (!stateValue || !track) { return; }
    id = String(track.id || '');
    if (!id || Object.prototype.hasOwnProperty.call(stateValue.originalServerOffsets, id)) { return; }
    stateValue.originalServerOffsets[id] = Math.round(Number(track.offset || 0));
  }

  function drainSubtitlePreviewWaiters(stateValue) {
    var callbacks;
    var index;
    if (!stateValue || stateValue.previewWriteInFlight || stateValue.previewPendingOffset || stateValue.previewDebounceTimer || stateValue.previewSizeTimer) { return; }
    callbacks = stateValue.previewIdleCallbacks.splice(0);
    for (index = 0; index < callbacks.length; index += 1) { callbacks[index](); }
  }

  function subtitleEditorPreviewPosition(stateValue) {
    return stateValue && stateValue.loop ? stateValue.bounds.start : playerAbsoluteTime();
  }

  function rebuildExternalSubtitlePreview(stateValue, streamId) {
    if (!subtitleEditorOpen || subtitleEditorState !== stateValue || stateValue.finalizing ||
        stateValue.previewMode !== 'server' || String(stateValue.selectedStreamID || '') !== String(streamId || '')) { return; }
    rebuildCurrentStream(subtitleEditorPreviewPosition(stateValue), false);
  }

  function queueSubtitlePreviewSize(stateValue) {
    if (!stateValue || stateValue.previewMode !== 'server') { return; }
    root.clearTimeout(stateValue.previewSizeTimer);
    stateValue.previewSizeTimer = root.setTimeout(function () {
      stateValue.previewSizeTimer = null;
      if (!subtitleEditorOpen || subtitleEditorState !== stateValue || stateValue.finalizing) { return; }
      rebuildCurrentStream(subtitleEditorPreviewPosition(stateValue), false);
      drainSubtitlePreviewWaiters(stateValue);
    }, 300);
  }

  function flushSubtitlePreviewOffset(stateValue) {
    var pending;
    if (!stateValue || stateValue.previewWriteInFlight || !stateValue.previewPendingOffset) {
      drainSubtitlePreviewWaiters(stateValue);
      return;
    }
    pending = stateValue.previewPendingOffset;
    stateValue.previewPendingOffset = null;
    stateValue.previewWriteInFlight = true;
    PlexClient.setSubtitleOffset(config, pending.streamId, pending.offsetMs, function (error) {
      if (!stateValue) { return; }
      stateValue.previewWriteInFlight = false;
      if (error) {
        stateValue.previewWriteError = error;
        stateValue.status = t('status.trackError');
        renderSubtitleEditor();
      } else {
        stateValue.previewServerOffsets[pending.streamId] = pending.offsetMs;
      }
      if (stateValue.previewPendingOffset) {
        flushSubtitlePreviewOffset(stateValue);
        return;
      }
      if (!error) { rebuildExternalSubtitlePreview(stateValue, pending.streamId); }
      drainSubtitlePreviewWaiters(stateValue);
    });
  }

  function queueSubtitlePreviewOffset(stateValue, track) {
    if (!stateValue || !track) { return; }
    rememberSubtitlePreviewOffset(stateValue, track);
    stateValue.previewWriteError = null;
    stateValue.previewPendingOffset = {
      streamId: String(track.id || ''),
      offsetMs: Math.round(Number(stateValue.offsetMs || 0))
    };
    root.clearTimeout(stateValue.previewDebounceTimer);
    stateValue.previewDebounceTimer = root.setTimeout(function () {
      stateValue.previewDebounceTimer = null;
      flushSubtitlePreviewOffset(stateValue);
    }, 150);
  }

  function whenSubtitlePreviewIdle(stateValue, callback) {
    if (!stateValue) { callback(); return; }
    stateValue.previewIdleCallbacks.push(callback);
    if (stateValue.previewDebounceTimer) {
      root.clearTimeout(stateValue.previewDebounceTimer);
      stateValue.previewDebounceTimer = null;
    }
    if (stateValue.previewSizeTimer) {
      root.clearTimeout(stateValue.previewSizeTimer);
      stateValue.previewSizeTimer = null;
    }
    if (stateValue.previewPendingOffset && !stateValue.previewWriteInFlight) { flushSubtitlePreviewOffset(stateValue); }
    drainSubtitlePreviewWaiters(stateValue);
  }

  function restoreSubtitlePreviewOffsets(stateValue, keepStreamId, callback) {
    var ids;
    var index = 0;
    var firstError = null;
    if (!stateValue) { callback(null); return; }
    ids = Object.keys(stateValue.previewServerOffsets).filter(function (id) {
      return String(id) !== String(keepStreamId || '') &&
        Number(stateValue.previewServerOffsets[id]) !== Number(stateValue.originalServerOffsets[id]);
    });
    function next() {
      var id;
      var track;
      if (index >= ids.length) { callback(firstError); return; }
      id = ids[index];
      index += 1;
      PlexClient.setSubtitleOffset(config, id, stateValue.originalServerOffsets[id], function (error) {
        if (error && !firstError) { firstError = error; }
        if (!error) {
          track = trackForId(currentPlayback && currentPlayback.subtitleTracks || [], id);
          if (track) { track.offset = stateValue.originalServerOffsets[id]; }
          delete stateValue.previewServerOffsets[id];
        }
        next();
      });
    }
    whenSubtitlePreviewIdle(stateValue, next);
  }

  function cancelLocalSubtitleRequest() {
    localSubtitleGeneration += 1;
    if (localSubtitleRequest && localSubtitleRequest.abort) { localSubtitleRequest.abort(); }
    localSubtitleRequest = null;
  }

  function configureLocalSubtitlePlayback(playback, callback) {
    var track = trackForId(playback.subtitleTracks, playback.options.subtitleStreamID);
    var classification = SubtitleSync.classify(track);
    var offset = subtitleOffsetFor(track);
    var generation;
    cancelLocalSubtitleRequest();
    localSubtitleState = null;
    playback.options.localSubtitleOverlay = false;
    if (!track || classification.kind !== 'embedded-text' || offset === 0 || failedSubtitleStreams[track.id]) {
      callback();
      return;
    }
    generation = localSubtitleGeneration;
    localSubtitleRequest = PlexClient.loadSubtitleText(config, playback, track, function (error, subtitleText) {
      var cues;
      if (generation !== localSubtitleGeneration || playback !== currentPlayback) { return; }
      localSubtitleRequest = null;
      cues = error ? [] : SubtitleSync.parse(subtitleText);
      if (error || !cues.length) {
        lastDiagnosticsError = DiagnosticsState.sanitizeText(error || t('player.subtitlePreviewFailed'));
        failedSubtitleStreams[track.id] = true;
        playback.options.localSubtitleOverlay = false;
      } else {
        playback.options.localSubtitleOverlay = true;
        localSubtitleState = { cues: cues, offsetMs: offset, streamId: track.id, size: playback.options.subtitleSize || 100 };
      }
      callback();
    });
  }

  function subtitleEditorTracks() {
    return [''].concat((currentPlayback.subtitleTracks || []).filter(function (track) {
      return SubtitleSync.classify(track).supported && !failedSubtitleStreams[track.id];
    }).map(function (track) { return String(track.id || ''); }));
  }

  function ensureSubtitleEditorView() {
    if (!subtitleEditorView) {
      subtitleEditorView = SubtitleEditorView.create({ document: document, setText: setText, SubtitleSync: SubtitleSync });
    }
    return subtitleEditorView;
  }

  function renderSubtitleOverlay(cues, offsetMs, size) {
    ensureSubtitleEditorView().renderOverlay(cues, playerAbsoluteTime() * 1000, offsetMs, size);
  }

  function updateActiveSubtitleOverlay() {
    if (subtitleEditorOpen && subtitleEditorState) {
      renderSubtitleOverlay(subtitleEditorState.cues, subtitleEditorState.offsetMs, subtitleEditorState.subtitleSize);
    } else if (localSubtitleState) {
      renderSubtitleOverlay(localSubtitleState.cues, localSubtitleState.offsetMs, localSubtitleState.size);
    } else {
      ensureSubtitleEditorView().hideOverlay();
    }
  }

  function stopSubtitlePreviewClock() {
    root.clearInterval(subtitlePreviewTimer);
    subtitlePreviewTimer = null;
  }

  function startSubtitlePreviewClock() {
    stopSubtitlePreviewClock();
    subtitlePreviewTimer = root.setInterval(updateActiveSubtitleOverlay, 50);
  }

  function subtitleEditorControls() {
    return ensureSubtitleEditorView().controls();
  }

  function subtitleEditorControlIndex(name) {
    var controls = subtitleEditorControls();
    var index;
    for (index = 0; index < controls.length; index += 1) {
      if (controls[index].getAttribute('data-subtitle-editor') === name) { return index; }
    }
    return -1;
  }

  function moveSubtitleEditorFocus(direction) {
    var rows = [['track'], ['size'], ['timeline'], ['minus', 'plus', 'loop', 'apply', 'cancel']];
    var controls = subtitleEditorControls();
    var current = controls[subtitleEditorIndex] && controls[subtitleEditorIndex].getAttribute('data-subtitle-editor');
    var row = 0;
    var column = 0;
    var targetRow;
    var targetColumn;
    var index;
    for (index = 0; index < rows.length; index += 1) {
      if (rows[index].indexOf(current) !== -1) {
        row = index;
        column = rows[index].indexOf(current);
        break;
      }
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

  function updateSubtitleEditorProgress() {
    var duration;
    if (!subtitleEditorState) { return; }
    duration = currentPlayback && Number(currentPlayback.duration || 0) / 1000;
    if (!duration) { return 0; }
    return Math.max(0, Math.min(100, playerAbsoluteTime() / duration * 100));
  }

  function renderSubtitleEditor() {
    var track;
    if (!subtitleEditorState) { return; }
    track = trackForId(currentPlayback.subtitleTracks, subtitleEditorState.selectedStreamID);
    ensureSubtitleEditorView().render({
      status: subtitleEditorState.status || '',
      track: track ? trackLabel(currentPlayback.subtitleTracks, track.id, t('subtitle.off')) : t('subtitle.off'),
      size: subtitleEditorState.subtitleSize, offsetMs: subtitleEditorState.offsetMs,
      progress: updateSubtitleEditorProgress(), index: subtitleEditorIndex,
      currentTime: formatTime(playerAbsoluteTime()),
      duration: formatTime(Number(currentPlayback.duration || 0) / 1000),
      loop: subtitleEditorState.loop, pointerActive: pointerSelectionActive
    });
    updateActiveSubtitleOverlay();
  }

  function abortSubtitleEditorRequest() {
    subtitleEditorGeneration += 1;
    if (subtitleEditorRequest && subtitleEditorRequest.abort) { subtitleEditorRequest.abort(); }
    subtitleEditorRequest = null;
  }

  function loadSubtitleEditorTrack(preserveStream) {
    var track;
    var classification;
    var generation;
    abortSubtitleEditorRequest();
    if (!subtitleEditorState) { return; }
    track = trackForId(currentPlayback.subtitleTracks, subtitleEditorState.selectedStreamID);
    classification = SubtitleSync.classify(track);
    subtitleEditorState.cues = [];
    subtitleEditorState.previewError = false;
    subtitleEditorState.offsetMs = track && Object.prototype.hasOwnProperty.call(subtitleEditorState.previewServerOffsets, String(track.id || ''))
      ? subtitleEditorState.previewServerOffsets[String(track.id || '')]
      : subtitleOffsetFor(track);
    subtitleEditorState.previewMode = classification.kind === 'external-text' ? 'server' :
      (classification.kind === 'embedded-text' ? 'overlay' : 'none');
    if (!track) {
      stopSubtitlePreviewClock();
      ensureSubtitleEditorView().hideOverlay();
      subtitleEditorState.status = '';
      currentPlayback.options.subtitleStreamID = '';
      currentPlayback.options.localSubtitleOverlay = false;
      renderSubtitleEditor();
      if (!preserveStream) { rebuildCurrentStream(subtitleEditorPreviewPosition(subtitleEditorState), false); }
      return;
    }
    if (classification.kind === 'external-text') {
      rememberSubtitlePreviewOffset(subtitleEditorState, track);
      stopSubtitlePreviewClock();
      ensureSubtitleEditorView().hideOverlay();
      subtitleEditorState.status = '';
      currentPlayback.options.subtitleStreamID = String(track.id || '');
      currentPlayback.options.localSubtitleOverlay = false;
      renderSubtitleEditor();
      if (!preserveStream) { rebuildCurrentStream(subtitleEditorPreviewPosition(subtitleEditorState), true); }
      return;
    }
    startSubtitlePreviewClock();
    currentPlayback.options.subtitleStreamID = '';
    currentPlayback.options.localSubtitleOverlay = false;
    subtitleEditorState.status = t('player.subtitlePreviewLoading');
    generation = subtitleEditorGeneration;
    renderSubtitleEditor();
    subtitleEditorRequest = PlexClient.loadSubtitleText(config, currentPlayback, track, function (error, subtitleText) {
      var cues;
      if (!subtitleEditorState || generation !== subtitleEditorGeneration || String(subtitleEditorState.selectedStreamID) !== String(track.id)) { return; }
      subtitleEditorRequest = null;
      cues = error ? [] : SubtitleSync.parse(subtitleText);
      if (error || !cues.length) {
        lastDiagnosticsError = DiagnosticsState.sanitizeText(error || t('player.subtitlePreviewFailed'));
        subtitleEditorState.previewError = true;
        subtitleEditorState.status = t('player.subtitlePreviewFailed');
        subtitleEditorState.cues = [];
      } else {
        subtitleEditorState.status = '';
        subtitleEditorState.cues = cues;
      }
      renderSubtitleEditor();
    });
    if (!preserveStream) { rebuildCurrentStream(subtitleEditorPreviewPosition(subtitleEditorState), false); }
  }

  function openSubtitleEditor() {
    var availability = subtitleEditorAvailability();
    var video = document.getElementById('player-video');
    var controls = document.getElementById('player-controls');
    var settings = document.getElementById('player-settings');
    var editor = document.getElementById('subtitle-editor');
    var originalOptions;
    if (!availability.enabled || subtitleEditorOpen || !currentPlayback) { return; }
    originalOptions = copyPlaybackOptions(currentPlayback.options);
    subtitleEditorState = {
      position: playerAbsoluteTime(),
      paused: video.paused,
      originalOptions: originalOptions,
      originalLocalSubtitleState: copyLocalSubtitleState(localSubtitleState),
      selectedStreamID: String(originalOptions.subtitleStreamID || ''),
      subtitleSize: Number(originalOptions.subtitleSize || 100),
      offsetMs: 0,
      cues: [],
      previewError: false,
      bounds: SubtitleSync.loopBounds(playerAbsoluteTime(), currentPlayback.duration / 1000),
      loop: false,
      applying: false,
      cancelRequested: false,
      status: '',
      previewMode: 'none',
      originalServerOffsets: {},
      previewServerOffsets: {},
      previewPendingOffset: null,
      previewWriteInFlight: false,
      previewWriteError: null,
      previewIdleCallbacks: [],
      previewDebounceTimer: null,
      previewSizeTimer: null,
      finalizing: false
    };
    subtitleEditorOpen = true;
    playerTimelineSuppressed = true;
    localSubtitleState = null;
    root.clearInterval(timelineTimer);
    root.clearInterval(estimatedEndTimer);
    settingsOpen = false;
    ensureSubtitleEditorView().setOpen(false);
    root.clearTimeout(subtitlePanelTransitionTimer);
    controls.style.transition = 'opacity 100ms linear';
    settings.style.transition = 'opacity 100ms linear';
    controls.style.opacity = '0';
    controls.style.pointerEvents = 'none';
    settings.style.opacity = '0';
    settings.style.pointerEvents = 'none';
    subtitlePanelTransitionTimer = root.setTimeout(function () {
      subtitlePanelTransitionTimer = null;
      settings.className = 'player-settings is-hidden';
      editor.className = 'subtitle-editor is-transitioning-in';
    }, interfaceAnimationDuration(100));
    subtitleEditorIndex = 0;
    currentPlayback.options = copyPlaybackOptions(originalOptions);
    currentPlayback.options.localSubtitleOverlay = false;
    loadSubtitleEditorTrack(true);
    if (subtitleEditorState.previewMode !== 'server') {
      currentPlayback.options.subtitleStreamID = '';
      rebuildCurrentStream(subtitleEditorState.bounds.start, false);
    }
  }

  function cycleSubtitleEditorTrack(direction) {
    var ids = subtitleEditorTracks();
    var index;
    if (!subtitleEditorState || !ids.length) { return; }
    index = ids.indexOf(String(subtitleEditorState.selectedStreamID || ''));
    index = index < 0 ? 0 : index;
    index = Math.max(0, Math.min(ids.length - 1, index + direction));
    subtitleEditorState.selectedStreamID = ids[index];
    loadSubtitleEditorTrack(false);
  }

  function setSubtitleEditorSize(value) {
    if (!subtitleEditorState) { return; }
    subtitleEditorState.subtitleSize = Number(value || 100);
    currentPlayback.options.subtitleSize = subtitleEditorState.subtitleSize;
    renderSubtitleEditor();
    queueSubtitlePreviewSize(subtitleEditorState);
  }

  function cycleSubtitleEditorSize(direction) {
    var sizes = [75, 100, 125, 150];
    var index = sizes.indexOf(Number(subtitleEditorState.subtitleSize || 100));
    index = index < 0 ? 1 : index;
    setSubtitleEditorSize(sizes[Math.max(0, Math.min(sizes.length - 1, index + direction))]);
  }

  function subtitleEditorTrackChoices() {
    return subtitleEditorTracks().map(function (id) {
      var track = trackForId(currentPlayback.subtitleTracks, id);
      return { value: id, label: track ? trackLabel(currentPlayback.subtitleTracks, track.id, t('subtitle.off')) : t('subtitle.off') };
    });
  }

  function openSubtitleEditorChoice(name) {
    var choices;
    var selected;
    if (!subtitleEditorState) { return; }
    if (name === 'track') {
      choices = subtitleEditorTrackChoices();
      selected = String(subtitleEditorState.selectedStreamID || '');
      openChoiceDialog(t('player.subtitles'), choices, selected, function (choice) {
        if (!subtitleEditorState) { return; }
        subtitleEditorState.selectedStreamID = String(choice.value || '');
        loadSubtitleEditorTrack(false);
      }, renderSubtitleEditor);
    } else if (name === 'size') {
      choices = [75, 100, 125, 150].map(function (size) { return { value: String(size), label: size + '%' }; });
      selected = String(subtitleEditorState.subtitleSize || 100);
      openChoiceDialog(t('player.subtitleSize'), choices, selected, function (choice) {
        setSubtitleEditorSize(choice.value);
      }, renderSubtitleEditor);
    }
  }

  function adjustSubtitleEditorOffset(delta) {
    var track;
    subtitleEditorState.offsetMs = SubtitleSync.adjust(subtitleEditorState.offsetMs, delta);
    renderSubtitleEditor();
    track = trackForId(currentPlayback.subtitleTracks, subtitleEditorState.selectedStreamID);
    if (track && subtitleEditorState.previewMode === 'server') {
      queueSubtitlePreviewOffset(subtitleEditorState, track);
    }
  }

  function seekSubtitleEditor(direction) {
    var duration = Number(currentPlayback.duration || 0) / 1000;
    var target = Math.max(0, Math.min(duration, playerAbsoluteTime() + direction * 10));
    subtitleEditorState.bounds = {
      start: target,
      end: Math.min(duration, target + 5)
    };
    seekPlayerTo(target);
    renderSubtitleEditor();
  }

  function restartTimelineAfterSubtitleRestore() {
    var video = document.getElementById('player-video');
    playerTimelineSuppressed = false;
    pendingPlaybackRestore = null;
    root.clearInterval(timelineTimer);
    timelineTimer = root.setInterval(function () { sendPlayerTimeline(video.paused ? 'paused' : 'playing'); }, 3000);
    startEstimatedEndTimer();
    updateActiveSubtitleOverlay();
    showPlayerControls();
  }

  function restorePlaybackAfterSubtitleEditor(stateValue, options, localState) {
    var controls = document.getElementById('player-controls');
    var settings = document.getElementById('player-settings');
    var editor = document.getElementById('subtitle-editor');
    stopSubtitlePreviewClock();
    root.clearTimeout(stateValue && stateValue.previewDebounceTimer);
    root.clearTimeout(stateValue && stateValue.previewSizeTimer);
    abortSubtitleEditorRequest();
    subtitleEditorOpen = false;
    subtitleEditorState = null;
    ensureSubtitleEditorView().hideOverlay();
    currentPlayback.options = options;
    localSubtitleState = localState;
    root.clearTimeout(subtitlePanelTransitionTimer);
    settingsOpen = true;
    playerSettingsSnapshot = currentPlayerSettingsSignature();
    updateSettingsDisplay();
    editor.className = 'subtitle-editor is-transitioning-out';
    subtitlePanelTransitionTimer = root.setTimeout(function () {
      subtitlePanelTransitionTimer = null;
      ensureSubtitleEditorView().setOpen(false);
      settings.className = 'player-settings';
      controls.style.transition = 'opacity 100ms linear';
      settings.style.transition = 'opacity 100ms linear';
      controls.style.opacity = '0';
      controls.style.pointerEvents = 'none';
      settings.style.opacity = '1';
      settings.style.pointerEvents = '';
    }, interfaceAnimationDuration(100));
    pendingPlaybackRestore = { paused: stateValue.paused };
    rebuildCurrentStream(stateValue.position, false);
  }

  function restoreCancelledSubtitleApply(stateValue) {
    function restoreSelection() {
      PlexClient.setStreamSelection(config, currentPlayback, stateValue.originalOptions, function () {
        if (!subtitleEditorState || subtitleEditorState !== stateValue) { return; }
        stateValue.applying = false;
        restorePlaybackAfterSubtitleEditor(stateValue, copyPlaybackOptions(stateValue.originalOptions), stateValue.originalLocalSubtitleState);
      });
    }
    stateValue.finalizing = true;
    restoreSubtitlePreviewOffsets(stateValue, '', function () { restoreSelection(); });
  }

  function failSubtitleApply(stateValue, restoreSelection) {
    function finish() {
      if (!subtitleEditorState || subtitleEditorState !== stateValue) { return; }
      stateValue.applying = false;
      stateValue.finalizing = false;
      stateValue.status = t('status.trackError');
      renderSubtitleEditor();
    }
    if (restoreSelection) {
      PlexClient.setStreamSelection(config, currentPlayback, stateValue.originalOptions, finish);
    } else {
      finish();
    }
  }

  function finishSubtitleEditorApply(stateValue, options, track) {
    var classification = SubtitleSync.classify(track);
    var localState = null;
    var stored = true;
    if (track && classification.kind === 'embedded-text' && stateValue.offsetMs !== 0) {
      stored = SubtitleOffsetStore.set(root.localStorage, subtitleServerIdentity(), currentPlayback.partId, track.id, stateValue.offsetMs);
      options.localSubtitleOverlay = true;
      localState = { cues: stateValue.cues, offsetMs: stateValue.offsetMs, streamId: track.id, size: stateValue.subtitleSize };
    } else {
      options.localSubtitleOverlay = false;
      if (track && classification.kind === 'embedded-text') {
        stored = SubtitleOffsetStore.remove(root.localStorage, subtitleServerIdentity(), currentPlayback.partId, track.id);
      }
    }
    if (!stored) {
      failSubtitleApply(stateValue, true);
      return;
    }
    currentPlayback.options = options;
    syncPlayerOverrideFromOptions(playerSettingsSnapshot);
    saveDetailMediaOverride();
    restorePlaybackAfterSubtitleEditor(stateValue, options, localState);
  }

  function applySubtitleEditor() {
    var stateValue = subtitleEditorState;
    var options;
    var track;
    var classification;
    if (!stateValue || stateValue.applying) { return; }
    track = trackForId(currentPlayback.subtitleTracks, stateValue.selectedStreamID);
    if (track && stateValue.previewMode === 'overlay' && stateValue.previewError) { stateValue.status = t('player.subtitlePreviewFailed'); renderSubtitleEditor(); return; }
    if (track && stateValue.previewMode === 'overlay' && (!stateValue.cues.length || subtitleEditorRequest)) { stateValue.status = t('player.subtitlePreviewLoading'); renderSubtitleEditor(); return; }
    options = copyPlaybackOptions(stateValue.originalOptions);
    options.subtitleStreamID = stateValue.selectedStreamID;
    options.subtitleSize = stateValue.subtitleSize;
    classification = SubtitleSync.classify(track);
    stateValue.applying = true;
    stateValue.cancelRequested = false;
    stateValue.finalizing = true;

    function selectTrack() {
      PlexClient.setStreamSelection(config, currentPlayback, options, function (selectionError) {
        if (!subtitleEditorState || subtitleEditorState !== stateValue) { return; }
        if (stateValue.cancelRequested) { restoreCancelledSubtitleApply(stateValue); return; }
        if (selectionError) {
          restoreSubtitlePreviewOffsets(stateValue, '', function () { failSubtitleApply(stateValue, false); });
          return;
        }
        if (track && classification.kind === 'external-text') { track.offset = stateValue.offsetMs; }
        finishSubtitleEditorApply(stateValue, options, track);
      });
    }

    stateValue.status = t('status.preparing');
    renderSubtitleEditor();
    restoreSubtitlePreviewOffsets(stateValue, track && classification.kind === 'external-text' ? track.id : '', function (offsetError) {
      if (!subtitleEditorState || subtitleEditorState !== stateValue) { return; }
      if (stateValue.cancelRequested) { restoreCancelledSubtitleApply(stateValue); return; }
      if (offsetError || stateValue.previewWriteError) { failSubtitleApply(stateValue, false); return; }
      selectTrack();
    });
  }

  function closeSubtitleEditor(apply) {
    var stateValue = subtitleEditorState;
    if (!stateValue) { return; }
    if (apply) { applySubtitleEditor(); return; }
    if (stateValue.applying) {
      stateValue.cancelRequested = true;
      stateValue.status = t('status.preparing');
      renderSubtitleEditor();
      return;
    }
    stateValue.applying = true;
    stateValue.finalizing = true;
    stateValue.status = t('status.preparing');
    renderSubtitleEditor();
    restoreCancelledSubtitleApply(stateValue);
  }

  function updateSubtitleEditorPlayback() {
    if (!subtitleEditorOpen || !subtitleEditorState) { updateActiveSubtitleOverlay(); return; }
    if (subtitleEditorState.loop && playerAbsoluteTime() >= subtitleEditorState.bounds.end - 0.05 && !playerStreamSwitching) {
      seekPlayerTo(subtitleEditorState.bounds.start);
    }
    updateSubtitleEditorProgress();
    updateActiveSubtitleOverlay();
  }

  function activateSubtitleEditorControl(name) {
    if (subtitleEditorState && subtitleEditorState.applying) {
      if (name === 'cancel') { closeSubtitleEditor(false); }
      return;
    }
    if (name === 'track') { openSubtitleEditorChoice('track'); }
    else if (name === 'size') { openSubtitleEditorChoice('size'); }
    else if (name === 'minus') { adjustSubtitleEditorOffset(-100); }
    else if (name === 'plus') { adjustSubtitleEditorOffset(100); }
    else if (name === 'loop' && subtitleEditorState.bounds.end > subtitleEditorState.bounds.start) { subtitleEditorState.loop = !subtitleEditorState.loop; renderSubtitleEditor(); }
    else if (name === 'apply') { closeSubtitleEditor(true); }
    else if (name === 'cancel') { closeSubtitleEditor(false); }
  }

  function handleSubtitleEditorKey(event, direction) {
    var controls;
    var name;
    if (!subtitleEditorOpen || !subtitleEditorState) { return false; }
    controls = subtitleEditorControls();
    name = controls[subtitleEditorIndex] && controls[subtitleEditorIndex].getAttribute('data-subtitle-editor');
    if (event.keyCode === 27 || event.keyCode === 461) { closeSubtitleEditor(false); return true; }
    if (subtitleEditorState.applying) { return true; }
    if (event.keyCode === 415) { document.getElementById('player-video').play(); return true; }
    if (event.keyCode === 19) { document.getElementById('player-video').pause(); return true; }
    if (direction === 'up' || direction === 'down') {
      moveSubtitleEditorFocus(direction);
      renderSubtitleEditor();
    } else if (direction === 'left' || direction === 'right') {
      if (name === 'track') { cycleSubtitleEditorTrack(direction === 'left' ? -1 : 1); }
      else if (name === 'size') { cycleSubtitleEditorSize(direction === 'left' ? -1 : 1); }
      else if (name === 'timeline') { seekSubtitleEditor(direction === 'left' ? -1 : 1); }
      else {
        moveSubtitleEditorFocus(direction);
        renderSubtitleEditor();
      }
    } else if (event.keyCode === 13) {
      activateSubtitleEditorControl(name);
    }
    return true;
  }

  function syncPlayerOverrideFromOptions(previousSignature) {
    var previous = String(previousSignature || '').split('|');
    var audio;
    var subtitle;
    var override = detailPreferenceState.ensureOverride();
    if (String(currentPlayback.options.audioStreamID || '') !== String(previous[0] || '')) {
      audio = trackForId(currentPlayback.audioTracks, currentPlayback.options.audioStreamID);
      override.audioLanguage = Settings.primaryLanguage(audio && (audio.languageTag || audio.languageCode));
    }
    if (String(currentPlayback.options.subtitleStreamID || '') !== String(previous[1] || '')) {
      subtitle = trackForId(currentPlayback.subtitleTracks, currentPlayback.options.subtitleStreamID);
      override.subtitlesOff = !subtitle;
      override.subtitleLanguage = subtitle ? Settings.primaryLanguage(subtitle.languageTag || subtitle.languageCode) : '';
    }
  }

  function rebuildCurrentStream(absoluteTime, updateSelection) {
    var video = document.getElementById('player-video');
    var resumeTarget = Math.max(0, Math.min(currentPlayback.duration / 1000, Math.floor(absoluteTime)));
    var playback = currentPlayback;
    var recoveryStep = PlaybackRecovery.current(playerRecoveryState);
    var transcodeSession;
    var applySource = function (sourceUrl) {
      if (appView !== 'player' || currentPlayback !== playback || playback.transcodeSession !== transcodeSession) { return; }
      try {
        playback.sourceUrl = sourceUrl;
        playback.hlsUrl = sourceUrl;
        startTranscodeKeepalive();
        renderPlaybackInfo();
        video.pause();
        currentPlayback.offsetBase = resumeTarget;
        video.src = sourceUrl;
        video.load();
      } catch (error) {
        playerStreamSwitching = false;
        playbackClock = PlaybackClock.freeze(playbackClock, false);
        setPlayerLoading(false);
        setText('player-status', t('status.streamError'));
        if (pendingPlaybackRestore) { restartTimelineAfterSubtitleRestore(); }
      }
    };
    var prepareSource = function () {
      PlexClient.preparePlayback(config, playback, playback.options, function (error, sourceUrl) {
        if (appView !== 'player' || currentPlayback !== playback || playback.transcodeSession !== transcodeSession) { return; }
        if (error || !sourceUrl) {
          playerStreamSwitching = false;
          playbackClock = PlaybackClock.freeze(playbackClock, false);
          setPlayerLoading(false);
          setText('player-status', t('status.streamError'));
          recoverPlaybackError();
          return;
        }
        applySource(sourceUrl);
      });
    };
    if (recoveryStep && recoveryStep.kind === 'direct-play') {
      playerRecoveryState = PlaybackRecovery.rebuild(playerRecoveryState, resumeTarget);
      applyCurrentPlaybackAttempt(false);
      return;
    }
    currentPlayback.options.offset = resumeTarget;
    pendingPlayerSeek = null;
    root.clearTimeout(playerSeekTimer);
    sendPlayerTimeline('stopped');
    playerBufferingIndicator.stop();
    playerStreamSwitching = true;
    playerBuffering = false;
    anchorPlayerClock(resumeTarget, true);
    stopTranscodeKeepalive();
    PlexClient.rotateTranscodeSession(playback);
    transcodeSession = playback.transcodeSession;
    setText('player-status', t('status.preparing'));
    setPlayerLoading(true, false);
    if (!updateSelection) { prepareSource(); return; }
    PlexClient.setStreamSelection(config, playback, playback.options, function (selectionError) {
      if (appView !== 'player' || currentPlayback !== playback || playback.transcodeSession !== transcodeSession) { return; }
      if (selectionError) { playerStreamSwitching = false; playbackClock = PlaybackClock.freeze(playbackClock, false); setPlayerLoading(false); setText('player-status', t('status.trackError')); return; }
      prepareSource();
    });
  }

  function playerBufferedRanges(video) {
    var ranges = [];
    var index;
    for (index = 0; index < video.buffered.length; index += 1) {
      ranges.push({ start: video.buffered.start(index), end: video.buffered.end(index) });
    }
    return ranges;
  }

  function playerSeekableRanges(video) {
    var ranges = [];
    var index;
    for (index = 0; index < video.seekable.length; index += 1) {
      ranges.push({ start: video.seekable.start(index), end: video.seekable.end(index) });
    }
    return ranges;
  }

  function playerDisplayTime() {
    return pendingPlayerSeek === null ? playerAbsoluteTime() : pendingPlayerSeek;
  }

  function commitPlayerSeek() {
    var video = document.getElementById('player-video');
    var decision;
    var target;
    if (pendingPlayerSeek === null || !currentPlayback || appView !== 'player') { return; }
    if (playerStreamSwitching) {
      playerSeekTimer = root.setTimeout(commitPlayerSeek, 100);
      return;
    }
    target = pendingPlayerSeek;
    pendingPlayerSeek = null;
    decision = PlayerSeekController.decide({
      target: target,
      duration: Number(currentPlayback.duration || 0) / 1000,
      nativeDuration: video.duration,
      offset: Number(currentPlayback.offsetBase || 0),
      buffered: playerBufferedRanges(video),
      seekable: playerSeekableRanges(video),
      directPlay: currentPlayback.options.delivery === 'direct-play'
    });
    if (!decision) { return; }
    if (decision.operation === 'rebuild') {
      rebuildCurrentStream(decision.target, false);
      return;
    }
    anchorPlayerClock(decision.target, false);
    playerNativeSeekPending = true;
    armNativeSeekVerification(decision.target, decision.nativeTime);
    try {
      video.currentTime = decision.nativeTime;
    } catch (error) {
      playerNativeSeekPending = false;
      playerNativeSeekTarget = null;
      root.clearTimeout(playerNativeSeekVerificationTimer);
      rebuildCurrentStream(decision.target, false);
      return;
    }
    updatePlayerDisplay();
    updateEstimatedEndTime();
    sendPlayerTimeline(video.paused ? 'paused' : 'playing');
  }

  function seekPlayerTo(absoluteTime) {
    var duration;
    if (!currentPlayback || !isFinite(absoluteTime)) { return; }
    duration = Number(currentPlayback.duration || 0) / 1000;
    if (!isFinite(duration) || duration <= 0) { return; }
    var target = Math.max(0, Math.min(duration, absoluteTime));
    pendingPlayerSeek = target;
    root.clearTimeout(playerSeekTimer);
    playerSeekTimer = root.setTimeout(commitPlayerSeek, 250);
    updatePlayerDisplay();
    updateEstimatedEndTime();
  }

  function applyPlayerSettings() {
    var position = playerAbsoluteTime();
    syncPlayerOverrideFromOptions(playerSettingsSnapshot);
    saveDetailMediaOverride();
    applyPlaybackVersion(currentPlayback, {
      mediaIndex: currentPlayback.options.mediaIndex,
      partIndex: currentPlayback.options.partIndex
    });
    PlexClient.setStreamSelection(config, currentPlayback, currentPlayback.options, function (selectionError) {
      if (selectionError || appView !== 'player') { recoverPlaybackError(); return; }
      configureLocalSubtitlePlayback(currentPlayback, function () {
        if (appView !== 'player') { return; }
        playerRecoveryState = PlaybackRecovery.create(playbackPlanFor(currentPlayback));
        playerRecoveryState.position = position;
        applyCurrentPlaybackAttempt(false);
      });
    });
  }

  function currentPlayerSettingsSignature() {
    if (!currentPlayback) { return ''; }
    return [
      currentPlayback.options.audioStreamID || '',
      currentPlayback.options.subtitleStreamID || '',
      currentPlayback.options.subtitleSize || 100,
      currentPlayback.options.mediaIndex === undefined ? '' : currentPlayback.options.mediaIndex,
      currentPlayback.options.partIndex === undefined ? '' : currentPlayback.options.partIndex,
      currentPlayback.requestedVideoQuality || currentPlayback.options.videoQuality || 'original',
      currentPlayback.requestedPlaybackMode || currentPlayback.options.playbackMode || 'auto'
    ].join('|');
  }

  function playerSettingsChanged() {
    return playerSettingsSnapshot !== currentPlayerSettingsSignature();
  }

  function setSettingsOpen(open) {
    var controls = document.getElementById('player-controls');
    var settings = document.getElementById('player-settings');
    root.clearTimeout(subtitlePanelTransitionTimer);
    settingsOpen = open;
    if (open) {
      playerSettingsSnapshot = currentPlayerSettingsSignature();
      settingIndex = 0;
      updateSettingsDisplay();
      settings.className = 'player-settings is-hidden';
      controls.style.transition = 'opacity 100ms linear';
      controls.style.opacity = '0';
      controls.style.pointerEvents = 'none';
      subtitlePanelTransitionTimer = root.setTimeout(function () {
        subtitlePanelTransitionTimer = null;
        settings.style.opacity = '1';
        settings.style.pointerEvents = '';
        settings.className = 'player-settings is-transitioning-in';
      }, interfaceAnimationDuration(100));
    } else {
      if (playerSettingsChanged()) { applyPlayerSettings(); }
      settings.className = 'player-settings is-transitioning-out';
      subtitlePanelTransitionTimer = root.setTimeout(function () {
        subtitlePanelTransitionTimer = null;
        settings.className = 'player-settings is-hidden';
        settings.style.opacity = '';
        settings.style.pointerEvents = '';
        controls.style.transition = 'opacity 100ms linear';
        controls.style.opacity = '1';
        controls.style.pointerEvents = '';
        updatePlayerButtonFocus();
      }, interfaceAnimationDuration(100));
    }
  }

  function togglePlayback() {
    var video = document.getElementById('player-video');
    if (video.paused) { video.play(); }
    else { video.pause(); }
  }

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
      subtitle = 'S' + Number(detail.seasonIndex || 0) + ' E' + Number(detail.episodeIndex || 0) +
        (episodeTitle ? ' - ' + episodeTitle : '');
    }
    return { primary: detail.title || '', secondary: subtitle };
  }

  function renderPlayerTitle(detail) {
    var title = document.getElementById('player-title');
    var display = playerDisplayTitle(detail);
    title.innerHTML = '';
    title.appendChild(element('span', 'player-title-primary', display.primary));
    if (display.secondary) {
      title.appendChild(element('span', 'player-title-secondary', display.secondary));
    }
  }

  function updatePlayerErrorFocus() {
    var buttons = document.querySelectorAll('.player-error-actions button');
    var index;
    for (index = 0; index < buttons.length; index += 1) {
      buttons[index].className = index === playerErrorIndex ? 'is-focused' : '';
    }
    if (buttons[playerErrorIndex]) { buttons[playerErrorIndex].focus(); }
  }

  function showPlayerError(waitingForNetwork, retryAction) {
    playerErrorVisible = true;
    playerErrorIndex = 0;
    playerErrorRetryAction = retryAction || null;
    if (waitingForNetwork || !lastDiagnosticsError) {
      lastDiagnosticsError = t(waitingForNetwork ? 'player.waitingNetwork' : 'player.errorMessage');
    }
    setText('player-error-message', t(waitingForNetwork ? 'player.waitingNetwork' : 'player.errorMessage'));
    document.getElementById('player-error').className = 'player-error';
    document.getElementById('player-error-retry').disabled = !!waitingForNetwork;
    setPlayerLoading(false);
    updatePlayerErrorFocus();
  }

  function hidePlayerError() {
    playerErrorVisible = false;
    document.getElementById('player-error').className = 'player-error is-hidden';
  }

  function playbackPlanFor(playback) {
    var requestedMode = playback.requestedPlaybackMode || playback.options.playbackMode || 'auto';
    var requestedQuality = playback.requestedVideoQuality || playback.options.videoQuality || 'original';
    var capabilities = {
      directPlay: playbackCapabilities.directPlay,
      codecs: playbackCapabilities.codecs,
      containers: playbackCapabilities.containers,
      uhd: playbackCapabilities.uhd,
      hdr10: playbackCapabilities.hdr10,
      dolbyVision: playbackCapabilities.dolbyVision,
      hdrKnown: playbackCapabilities.hdrKnown
    };
    var selectedAudio = String(playback.options.audioStreamID || '');
    var defaultAudio = '';
    (playback.audioTracks || []).forEach(function (track) { if (track.selected) { defaultAudio = String(track.id || ''); } });
    if (playback.options.subtitleStreamID || (selectedAudio && defaultAudio && selectedAudio !== defaultAudio)) {
      capabilities.directPlay = false;
    }
    return PlaybackStrategy.plan(
      requestedMode,
      capabilities,
      playback.mediaVersions || [],
      playback.options.mediaIndex,
      requestedQuality
    );
  }

  function playbackViolatesDirectOnly(playback) {
    return !!playback && playback.requestedPlaybackMode === 'direct' && /^transcode-/.test(String(playback.playbackMode || ''));
  }

  function applyPlaybackVersion(playback, step) {
    var versions = playback.mediaVersions || [];
    var version;
    var index;
    for (index = 0; index < versions.length; index += 1) {
      if (versions[index].mediaIndex === step.mediaIndex && versions[index].partIndex === step.partIndex) {
        version = versions[index];
        break;
      }
    }
    if (!version) { return; }
    playback.mediaIndex = version.mediaIndex;
    playback.partIndex = version.partIndex;
    playback.partId = version.partId;
    playback.partKey = version.partKey;
    playback.fileName = version.fileName;
    playback.fileSize = version.fileSize;
    playback.originalContainer = version.container;
    playback.originalVideoCodec = version.videoCodec;
    playback.videoDynamicRange = version.videoDynamicRange;
    playback.sourceWidth = version.width;
    playback.sourceHeight = version.height;
    playback.mediaProfile = version.profile || playback.mediaProfile;
    playback.audioTracks = version.audioTracks || playback.audioTracks;
    playback.subtitleTracks = version.subtitleTracks || playback.subtitleTracks;
  }

  function applyCurrentPlaybackAttempt(preserveFrame) {
    var step = PlaybackRecovery.current(playerRecoveryState);
    var video = document.getElementById('player-video');
    var position = Math.max(0, Number(playerRecoveryState.position || 0));
    if (!currentPlayback || !step || appView !== 'player') { showPlayerError(false); return; }
    playerRecoveryState = PlaybackRecovery.start(playerRecoveryState, position);
    applyPlaybackVersion(currentPlayback, step);
    currentPlayback.options.delivery = step.kind === 'direct-play' ? 'direct-play' : step.kind;
    currentPlayback.options.mediaIndex = step.mediaIndex;
    currentPlayback.options.partIndex = step.partIndex;
    currentPlayback.options.videoQuality = step.videoQuality;
    currentPlayback.options.videoResolution = step.videoResolution;
    currentPlayback.options.playbackMode = step.kind === 'transcode' || step.kind === 'safe-transcode' ? 'transcode' : 'auto';
    currentPlayback.options.offset = step.kind === 'direct-play' ? 0 : position;
    currentPlayback.offsetBase = step.kind === 'direct-play' ? 0 : position;
    currentPlayback.directSeekTarget = step.kind === 'direct-play' ? position : null;
    stopTranscodeKeepalive();
    PlexClient.rotateTranscodeSession(currentPlayback);
    playerBufferingIndicator.stop();
    playerStreamSwitching = true;
    playerBuffering = false;
    anchorPlayerClock(position, true);
    hidePlayerError();
    setText('player-status', t('status.preparing'));
    setPlayerLoading(true, !!preserveFrame);
    PlexClient.preparePlayback(config, currentPlayback, currentPlayback.options, function (error, sourceUrl) {
      if (appView !== 'player') { return; }
      if (error || !sourceUrl) { recoverPlaybackError(); return; }
      if (playbackViolatesDirectOnly(currentPlayback)) { recoverPlaybackError(); return; }
      startTranscodeKeepalive();
      renderPlaybackInfo();
      video.pause();
      video.src = sourceUrl;
      video.load();
    });
  }

  function recoverPlaybackError() {
    var position = !currentPlayback ? 0 : (playerStreamSwitching ? Number(playerRecoveryState.position || 0) : playerAbsoluteTime());
    var offline = root.navigator && root.navigator.onLine === false;
    root.clearTimeout(playerRecoveryTimer);
    if (!currentPlayback || !playerRecoveryState.plan.length) {
      playerStreamSwitching = false;
      showPlayerError(false);
      return;
    }
    playerRecoveryState = PlaybackRecovery.fail(playerRecoveryState, offline, position);
    if (playerRecoveryState.status === 'waiting-network') {
      playerStreamSwitching = false;
      showPlayerError(true);
      return;
    }
    if (playerRecoveryState.status === 'failed') {
      playerStreamSwitching = false;
      showPlayerError(false);
      return;
    }
    playerRecoveryTimer = root.setTimeout(function () { applyCurrentPlaybackAttempt(true); }, 350);
  }

  function retryPlaybackFromError() {
    var retryAction = playerErrorRetryAction;
    hidePlayerError();
    playerErrorRetryAction = null;
    if (retryAction) { retryAction(); return; }
    if (!currentPlayback) { startCurrentPlayback(); return; }
    playerRecoveryState = PlaybackRecovery.retry(playerRecoveryState);
    applyCurrentPlaybackAttempt(true);
  }

  function handlePlayerErrorKey(event, direction) {
    if (!playerErrorVisible) { return false; }
    if (direction === 'left' || direction === 'right') {
      playerErrorIndex = Math.max(0, Math.min(2, playerErrorIndex + (direction === 'left' ? -1 : 1)));
      if (document.querySelectorAll('.player-error-actions button')[playerErrorIndex].disabled) {
        playerErrorIndex = direction === 'left' ? 2 : 1;
      }
      updatePlayerErrorFocus();
    } else if (event.keyCode === 13) {
      if (playerErrorIndex === 0) { retryPlaybackFromError(); }
      else if (playerErrorIndex === 1) { hidePlayerError(); setSettingsOpen(true); }
      else { hidePlayerError(); closePlayer(); }
    } else if (event.keyCode === 27 || event.keyCode === 461) {
      hidePlayerError(); closePlayer();
    }
    return true;
  }

  function renderResumeChoice() {
    var buttons = document.querySelectorAll('.resume-choice-actions button');
    var index;
    setText('resume-choice-title', t('player.resumeTitle'));
    setText('resume-choice-resume', t('player.resumeFrom', { time: formatLongTime(resumeChoiceState.offset) }));
    setText('resume-choice-restart', t('player.playFromBeginning'));
    setText('resume-choice-cancel', t('player.cancel'));
    for (index = 0; index < buttons.length; index += 1) {
      buttons[index].className = index === resumeChoiceState.index ? 'is-focused' : '';
    }
    if (!pointerSelectionActive && buttons[resumeChoiceState.index]) { buttons[resumeChoiceState.index].focus(); }
  }

  function showPlayerSurface() {
    appView = 'player';
    hidePlayerError();
    backgroundAudio.stop();
    resetSkipPrompt();
    initializePlayerControlsHidden();
    document.getElementById('detail-view').className = 'detail-view is-hidden';
    document.getElementById('player-view').className = 'player-view';
    document.getElementById('player-view').style.backgroundImage = 'none';
  }

  function cancelResumeChoice() {
    resumeChoiceVisible = false;
    resumeChoiceState = null;
    document.getElementById('resume-choice').className = 'resume-choice is-hidden';
    if (typeof restorePlaylistDirectPlayOrigin === 'function' && restorePlaylistDirectPlayOrigin()) { return; }
    document.getElementById('player-view').className = 'player-view is-hidden';
    document.getElementById('detail-view').className = 'detail-view';
    appView = 'detail';
    updateDetailFocus();
    scheduleTheme(currentDetail);
  }

  function beginPlayer(startOffset) {
    showPlayerSurface();
    if (typeof completePlaylistDirectPlayStart === 'function') { completePlaylistDirectPlayStart(); }
    resumeChoiceVisible = false;
    resumeChoiceState = null;
    document.getElementById('resume-choice').className = 'resume-choice is-hidden';
    startCurrentPlayback(startOffset);
  }

  function activateResumeChoice() {
    var result = ResumeChoice.select(resumeChoiceState);
    if (result.action === 'cancel') { cancelResumeChoice(); return; }
    beginPlayer(result.offset);
  }

  function handleResumeChoiceKey(event, direction) {
    if (!resumeChoiceVisible) { return false; }
    if (direction === 'left' || direction === 'right') {
      resumeChoiceState = ResumeChoice.move(resumeChoiceState, direction === 'left' ? -1 : 1);
      renderResumeChoice();
    } else if (event.keyCode === 13 || event.keyCode === 415) {
      activateResumeChoice();
    } else if (event.keyCode === 27 || event.keyCode === 461) {
      ResumeChoice.cancel();
      cancelResumeChoice();
    }
    return true;
  }

  function startCurrentPlayback(startOffset, versionAffinity) {
    var session = 'ploff-' + new Date().getTime();
    resetSkipPrompt();
    cancelLocalSubtitleRequest();
    failedSubtitleStreams = {};
    localSubtitleState = null;
    renderPlayerTitle(currentDetail);
    setText('player-status', t('status.preparing'));
    playerBufferingIndicator.stop();
    playerStreamSwitching = true;
    setPlayerLoading(true);
    PlexClient.loadPlayback(config, currentDetail.ratingKey, session, detailPlaybackPreferences(versionAffinity), function (error, playback) {
      var video;
      var resolvedStart;
      if (error || appView !== 'player') {
        if (error) { lastDiagnosticsError = DiagnosticsState.sanitizeText(error); }
        playerStreamSwitching = false; setText('player-status', t('status.streamError')); showPlayerError(false); return;
      }
      currentPlayback = playback;
      if (versionAffinity) {
        detailPreferenceState.setVersion(playback.mediaIndex, playback.partIndex);
      }
      resolvedStart = startOffset === null || startOffset === undefined
        ? Math.max(0, Number(playback.resumePosition || 0))
        : Math.max(0, Number(startOffset || 0));
      currentPlayback.resumePosition = resolvedStart;
      currentPlayback.options.offset = resolvedStart;
      currentPlayback.offsetBase = resolvedStart;
      anchorPlayerClock(resolvedStart, true);
      currentPlayback.requestedPlaybackMode = playback.options.playbackMode || 'auto';
      currentPlayback.requestedVideoQuality = playback.options.videoQuality || 'original';
      configureLocalSubtitlePlayback(currentPlayback, function () {
        if (appView !== 'player' || currentPlayback !== playback) { return; }
        playerRecoveryState = PlaybackRecovery.create(playbackPlanFor(playback));
        playerRecoveryState.position = resolvedStart;
        renderPlaybackInfo();
        video = document.getElementById('player-video');
        video.autoplay = true;
        updateEpisodeCommands();
        updatePlaylistQueueButton();
        playerZone = 'buttons'; playerButtonIndex = 1; updatePlayerButtonFocus(); initializePlayerControlsHidden();
        root.clearInterval(timelineTimer);
        timelineTimer = root.setInterval(function () { sendPlayerTimeline(video.paused ? 'paused' : 'playing'); }, 3000);
        startEstimatedEndTimer();
        applyCurrentPlaybackAttempt(false);
      });
    });
  }

  function openPlayer() {
    if (appView === 'detail' && (!currentDetail || !currentDetail.ratingKey ||
        currentDetail.type === 'show' || currentDetail.type === 'season')) {
      detailPlayPending = true;
      return;
    }
    if (!currentDetail || !currentDetail.ratingKey) { showMessage(t('status.metadataUnavailable')); return; }
    detailPlayPending = false;
    resumeChoiceState = ResumeChoice.create(currentDetail.viewOffset);
    if (!resumeChoiceState.visible) { beginPlayer(null); return; }
    showPlayerSurface();
    resumeChoiceVisible = true;
    document.getElementById('resume-choice').className = 'resume-choice';
    renderResumeChoice();
  }

  function switchPlayerEpisode(direction) {
    var context = episodeNavigationContext();
    var video = document.getElementById('player-video');
    var preferenceSnapshot = detailPreferenceState.snapshot();
    var versionAffinity = null;
    var versionIndex;
    if (preferenceSnapshot.override && preferenceSnapshot.override.mediaIndex !== null && currentPlayback && VersionSelection) {
      for (versionIndex = 0; versionIndex < (currentPlayback.mediaVersions || []).length; versionIndex += 1) {
        if (currentPlayback.mediaVersions[versionIndex].mediaIndex === currentPlayback.mediaIndex &&
            currentPlayback.mediaVersions[versionIndex].partIndex === currentPlayback.partIndex) {
          versionAffinity = VersionSelection.signature(currentPlayback.mediaVersions[versionIndex]);
          break;
        }
      }
    }
    if (!context || !episodeResolver.canMove(context, direction)) { return; }
    episodeResolver.resolve(context, direction, function (navigationError, target) {
      if (navigationError || appView !== 'player') {
        if (appView === 'player') {
          lastDiagnosticsError = DiagnosticsState.sanitizeText(navigationError || t('status.streamError'));
          setText('player-status', t('status.streamError'));
          showPlayerError(false, function () { switchPlayerEpisode(direction); });
        }
        return;
      }
      PlexClient.loadMetadata(config, target.episode.ratingKey, function (metadataError, detail) {
        var index;
        if (metadataError || appView !== 'player') {
          if (appView === 'player') {
            lastDiagnosticsError = DiagnosticsState.sanitizeText(metadataError || t('status.metadataUnavailable'));
            setText('player-status', t('status.streamError'));
            showPlayerError(false, function () { switchPlayerEpisode(direction); });
          }
          return;
        }
        resetSkipPrompt();
        cancelAutoplayCountdown();
        sendPlayerTimeline('stopped');
        playerBufferingIndicator.stop();
        playerStreamSwitching = true;
        setPlayerLoading(true);
        root.clearInterval(timelineTimer);
        root.clearInterval(estimatedEndTimer);
        video.pause();
        video.removeAttribute('src');
        video.load();
        detailSeasonIndex = target.seasonIndex;
        seriesContext.episodes = target.episodes;
        detailEpisodeIndex = target.episodeIndex;
        for (index = 0; index < seriesContext.seasons.length; index += 1) {
          seriesContext.seasons[index].selected = index === detailSeasonIndex;
        }
        currentDetail = detail;
        queueDetailMediaProfile(detail);
        renderSeasonTabs();
        renderEpisodeStrip();
        startCurrentPlayback(null, versionAffinity);
      });
    });
  }

  function closePlayer() {
    var video = document.getElementById('player-video');
    var playbackRatingKey = currentPlayback && currentPlayback.ratingKey;
    playerBufferingIndicator.stop();
    capturePlaybackDiagnostics();
    sendFinalPlayerTimeline(function (absoluteTime, reported) {
      if (reported) { applyLocalPlaybackProgress(playbackRatingKey, absoluteTime); }
      refreshEpisodePlaybackState(playbackRatingKey, absoluteTime);
    }); stopTranscodeKeepalive(); root.clearInterval(timelineTimer); root.clearInterval(estimatedEndTimer); root.clearTimeout(playerControlsTimer); root.clearTimeout(playerResumeTimer); root.clearTimeout(playerSeekTimer); root.clearTimeout(playerRecoveryTimer); root.clearTimeout(playerClockRepairTimer); root.clearTimeout(playerClockRepairFallbackTimer); root.clearTimeout(playerNativeSeekVerificationTimer); cancelAutoplayCountdown(); resetSkipPrompt();
    pendingPlayerSeek = null;
    resetChapterDrawer();
    closePlaylistQueueDrawer(false);
    abortSubtitleEditorRequest();
    if (subtitleEditorState) {
      subtitleEditorState.finalizing = true;
      restoreSubtitlePreviewOffsets(subtitleEditorState, '', function () {});
    }
    stopSubtitlePreviewClock();
    root.clearTimeout(subtitlePanelTransitionTimer);
    subtitlePanelTransitionTimer = null;
    cancelLocalSubtitleRequest();
    subtitleEditorOpen = false;
    subtitleEditorState = null;
    playerTimelineSuppressed = false;
    pendingPlaybackRestore = null;
    playbackClock = PlaybackClock.create(2);
    playerBuffering = false;
    playerNativeSeekPending = false;
    playerNativeSeekTarget = null;
    playerNativeSeekVerificationTimer = null;
    playerClockRepairTimer = null;
    playerClockRepairFallbackTimer = null;
    localSubtitleState = null;
    document.getElementById('subtitle-editor').className = 'subtitle-editor is-hidden';
    document.getElementById('player-controls').style.opacity = '';
    document.getElementById('player-controls').style.pointerEvents = '';
    document.getElementById('player-controls').style.transition = '';
    document.getElementById('player-settings').style.opacity = '';
    document.getElementById('player-settings').style.pointerEvents = '';
    document.getElementById('player-settings').style.transition = '';
    document.getElementById('subtitle-preview-overlay').className = 'subtitle-preview-overlay is-hidden';
    resumeChoiceVisible = false;
    resumeChoiceState = null;
    document.getElementById('resume-choice').className = 'resume-choice is-hidden';
    episodeResolver.cancel();
    settingsOpen = false; playerStreamSwitching = false; video.pause(); video.removeAttribute('src'); video.load(); currentPlayback = null;
    setPlayerLoading(false);
    hidePlayerError();
    playerErrorRetryAction = null;
    playerRecoveryState = PlaybackRecovery.create([]);
    playerBackArmed = false;
    document.getElementById('player-settings').className = 'player-settings is-hidden';
    document.getElementById('player-view').className = 'player-view is-hidden';
    if (typeof restorePlaylistDirectPlayOrigin === 'function' && restorePlaylistDirectPlayOrigin()) { return; }
    appView = 'detail'; detailBackLockedUntil = new Date().getTime() + 700;
    document.getElementById('detail-view').className = 'detail-view'; ensureDetailMediaProfile(currentDetail); updateDetailFocus();
    scheduleTheme(currentDetail);
  }
