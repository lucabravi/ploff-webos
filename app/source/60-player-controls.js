  // Player clock, progress, controls, chapters, tracks, and summaries.
  function sendPlayerTimeline(stateName) {
    var absoluteTime = playerAbsoluteTime();
    if (!PlayerTimelinePolicy.shouldReport({
      hasPlayback: !!currentPlayback,
      suppressed: playerTimelineSuppressed,
      position: absoluteTime
    })) { return; }
    PlexClient.sendTimeline(config, currentPlayback, stateName, absoluteTime * 1000);
  }

  function sendFinalPlayerTimeline(callback) {
    var playback = currentPlayback;
    var absoluteTime = playerAbsoluteTime();
    if (!PlayerTimelinePolicy.shouldReport({
      hasPlayback: !!playback,
      suppressed: playerTimelineSuppressed,
      position: absoluteTime
    })) {
      callback();
      return;
    }
    PlexClient.sendTimeline(config, playback, 'stopped', absoluteTime * 1000, function () { callback(); });
  }

  function stopTranscodeKeepalive() {
    root.clearInterval(transcodeKeepaliveTimer);
    transcodeKeepaliveTimer = null;
  }

  function startTranscodeKeepalive() {
    var playback = currentPlayback;
    stopTranscodeKeepalive();
    if (!playback || !playback.transcodeSession || playback.options.delivery === 'direct-play') { return; }
    PlexClient.pingTranscode(config, playback);
    transcodeKeepaliveTimer = root.setInterval(function () {
      if (appView !== 'player' || currentPlayback !== playback) {
        stopTranscodeKeepalive();
        return;
      }
      PlexClient.pingTranscode(config, playback);
    }, 30000);
  }

  function anchorPlayerClock(absoluteTime, frozen) {
    root.clearTimeout(playerClockRepairTimer);
    root.clearTimeout(playerClockRepairFallbackTimer);
    playerClockRepairTimer = null;
    playerClockRepairFallbackTimer = null;
    playerNativeSeekPending = false;
    playerNativeSeekTarget = null;
    root.clearTimeout(playerNativeSeekVerificationTimer);
    playerNativeSeekVerificationTimer = null;
    playbackClock = PlaybackClock.anchor(playbackClock, absoluteTime);
    playbackClock = PlaybackClock.freeze(playbackClock, !!frozen);
  }

  function armNativeSeekVerification(absoluteTarget, nativeTarget) {
    root.clearTimeout(playerNativeSeekVerificationTimer);
    playerNativeSeekTarget = nativeTarget;
    playerNativeSeekVerificationTimer = root.setTimeout(function () {
      playerNativeSeekVerificationTimer = null;
      if (!playerNativeSeekPending || appView !== 'player' || !currentPlayback) { return; }
      playerNativeSeekPending = false;
      playerNativeSeekTarget = null;
      rebuildCurrentStream(absoluteTarget, false);
    }, 5000);
  }

  function schedulePlayerClockRepair() {
    if (playerClockRepairTimer || playerClockRepairFallbackTimer || playerBuffering || playerStreamSwitching || playerNativeSeekPending) { return; }
    playerClockRepairTimer = root.setTimeout(function () {
      var video = document.getElementById('player-video');
      var observation;
      var target;
      if (appView !== 'player' || !currentPlayback || playerBuffering || playerStreamSwitching || playerNativeSeekPending) {
        playerClockRepairTimer = null;
        return;
      }
      observation = PlaybackClock.observe(playbackClock, Number(currentPlayback.offsetBase || 0), Number(video.currentTime || 0), false);
      playbackClock = observation.state;
      playerClockRepairTimer = null;
      if (!observation.desynced) { return; }
      target = observation.time;
      if (PlayerSeekController.repair() === 'rebuild') {
        rebuildCurrentStream(target, false);
        return;
      }
    }, 400);
  }

  function playerAbsoluteTime() {
    var video = document.getElementById('player-video');
    var observation;
    if (!currentPlayback) { return 0; }
    if (playerStreamSwitching || playerBuffering || playerNativeSeekPending) { return PlaybackClock.position(playbackClock); }
    observation = PlaybackClock.observe(playbackClock, Number(currentPlayback.offsetBase || 0), Number(video.currentTime || 0), false);
    playbackClock = observation.state;
    if (observation.desynced) { schedulePlayerClockRepair(); }
    return observation.time;
  }

  function ensurePlayerControlsView() {
    if (!playerControlsView) { playerControlsView = PlayerControlsView.create({ document: document, setText: setText }); }
    return playerControlsView;
  }

  function setPlayerLoading(loading, preserveFrame) {
    ensurePlayerControlsView().renderLoading(loading, preserveFrame);
  }

  var playerBufferingIndicator = PlayerBufferingIndicator.create({
    root: root,
    isEligible: function () {
      var video = document.getElementById('player-video');
      return appView === 'player' && !!currentPlayback && !playerStreamSwitching && !playerNativeSeekPending && !video.paused;
    },
    position: function () { return Number(document.getElementById('player-video').currentTime || 0); },
    onShow: function () {
      playerBuffering = true;
      playbackClock = PlaybackClock.freeze(playbackClock, true);
      setPlayerLoading(true, true);
    },
    onHide: function () {
      playerBuffering = false;
      playbackClock = PlaybackClock.freeze(playbackClock, false);
      setPlayerLoading(false);
    }
  });

  function resumeRebuiltStream() {
    root.clearTimeout(playerResumeTimer);
    playerResumeTimer = root.setTimeout(function () {
      var video = document.getElementById('player-video');
      if (appView !== 'player' || video.readyState < 2) { return; }
      if (pendingPlaybackRestore && pendingPlaybackRestore.paused) {
        playerStreamSwitching = false;
        playerBuffering = false;
        playbackClock = PlaybackClock.freeze(playbackClock, false);
        video.pause();
        setPlayerLoading(false);
        setText('player-status', t('status.paused'));
        restartTimelineAfterSubtitleRestore();
        updatePlayerDisplay();
        return;
      }
      playerStreamSwitching = false;
      try { video.play(); } catch (error) { return; }
      playerResumeTimer = root.setTimeout(function () {
        if (appView === 'player' && video.paused && video.readyState >= 2) {
          try { video.play(); } catch (error) { return; }
        }
      }, 250);
    }, 120);
  }

  function updatePlayerDisplay() {
    var video = document.getElementById('player-video');
    var duration = currentPlayback ? currentPlayback.duration / 1000 : video.duration;
    var displayTime = playerDisplayTime();
    ensurePlayerControlsView().renderProgress({
      progress: duration ? displayTime / duration * 100 : 0,
      currentTime: formatTime(displayTime), duration: formatTime(duration), paused: video.paused,
      playLabel: t('player.play'), pauseLabel: t('player.pause')
    });
    updateSkipPrompt();
  }

  function playerSkipMarkerClass(hidden) {
    var className = 'player-skip-marker';
    if (playerControlsMode === 'full') { className += ' is-controls-full'; }
    else if (playerControlsMode === 'timeline') { className += ' is-controls-timeline'; }
    if (hidden) { className += ' is-hidden'; }
    else if (playerZone === 'skip') { className += ' is-focused'; }
    return className;
  }

  function resetSkipPrompt() {
    root.clearTimeout(skipPromptTimer);
    skipPromptTimer = null;
    skipPromptTimerDeadline = 0;
    skipMarkerState = SkipMarkerState.create();
    document.getElementById('player-skip-marker').className = playerSkipMarkerClass(true);
    if (playerZone === 'skip') { playerZone = 'buttons'; playerButtonIndex = 1; }
  }

  function scheduleSkipPromptExpiry() {
    var delay;
    if (!skipMarkerState.visible || skipMarkerState.mode !== 'timed') {
      root.clearTimeout(skipPromptTimer);
      skipPromptTimer = null;
      skipPromptTimerDeadline = 0;
      return;
    }
    if (skipPromptTimer && skipPromptTimerDeadline === skipMarkerState.deadline) { return; }
    root.clearTimeout(skipPromptTimer);
    skipPromptTimerDeadline = skipMarkerState.deadline;
    delay = Math.max(0, skipMarkerState.deadline - new Date().getTime());
    skipPromptTimer = root.setTimeout(function () {
      skipPromptTimer = null;
      skipPromptTimerDeadline = 0;
      updateSkipPrompt();
    }, delay + 20);
  }

  function renderSkipPrompt() {
    var button = document.getElementById('player-skip-marker');
    var requestedFocus = skipMarkerState.focusRequested;
    if (!skipMarkerState.visible || !skipMarkerState.marker) {
      button.className = playerSkipMarkerClass(true);
      if (playerZone === 'skip') {
        playerZone = 'buttons';
        playerButtonIndex = 1;
        if (playerControlsVisible) { updatePlayerButtonFocus(); }
      }
      scheduleSkipPromptExpiry();
      return;
    }
    setText('player-skip-marker', t(skipMarkerState.marker.type === 'intro' ? 'player.skipIntro' : 'player.skipCredits'));
    if (requestedFocus) {
      skipMarkerState = SkipMarkerState.clearFocusRequest(skipMarkerState);
      playerZone = 'skip';
    }
    button.className = playerSkipMarkerClass(false);
    if (requestedFocus) { updatePlayerButtonFocus(); }
    scheduleSkipPromptExpiry();
  }

  function updateSkipPrompt() {
    var timeOffset;
    var marker;
    if (!currentPlayback || appView !== 'player') { return; }
    timeOffset = playerAbsoluteTime() * 1000;
    marker = SkipMarkerState.activeMarker(currentPlayback.markers, timeOffset);
    skipMarkerState = SkipMarkerState.update(
      skipMarkerState,
      currentPlayback.markers,
      timeOffset,
      new Date().getTime(),
      appSettings.skipPromptDuration
    );
    if (marker && playerControlsVisible) {
      skipMarkerState = SkipMarkerState.showForControls(skipMarkerState, marker);
    }
    renderSkipPrompt();
  }

  function showSkipPromptForControls() {
    var marker;
    if (!currentPlayback) { return; }
    marker = SkipMarkerState.activeMarker(currentPlayback.markers, playerAbsoluteTime() * 1000);
    if (!marker) { updateSkipPrompt(); return; }
    skipMarkerState = SkipMarkerState.showForControls(skipMarkerState, marker);
    renderSkipPrompt();
  }

  function hideSkipPromptWithControls() {
    skipMarkerState = SkipMarkerState.hideWithControls(skipMarkerState);
    renderSkipPrompt();
  }

  function dismissSkipPrompt() {
    skipMarkerState = SkipMarkerState.dismiss(skipMarkerState);
    renderSkipPrompt();
  }

  function activateSkipMarker() {
    var marker = skipMarkerState.marker;
    if (!skipMarkerState.visible || !marker) { return; }
    dismissSkipPrompt();
    seekPlayerTo(Number(marker.endTimeOffset) / 1000);
  }

  function updateEstimatedEndTime() {
    var duration;
    var remaining;
    var end;
    var hours;
    var minutes;
    if (!currentPlayback || appView !== 'player') { setText('player-end-time', ''); return; }
    duration = currentPlayback.duration / 1000;
    remaining = Math.max(0, duration - playerAbsoluteTime());
    end = new Date(new Date().getTime() + remaining * 1000);
    hours = String(end.getHours());
    minutes = String(end.getMinutes());
    setText('player-end-time', t('player.endsAt', {
      time: (hours.length < 2 ? '0' : '') + hours + ':' + (minutes.length < 2 ? '0' : '') + minutes
    }));
  }

  function startEstimatedEndTimer() {
    root.clearInterval(estimatedEndTimer);
    updateEstimatedEndTime();
    estimatedEndTimer = root.setInterval(updateEstimatedEndTime, 10000);
  }

  function schedulePlayerControlsTimeout() {
    var delay = PlayerControlsState.timeout(playerControlsMode);
    root.clearTimeout(playerControlsTimer);
    if (!delay) { return; }
    playerControlsTimer = root.setTimeout(function () {
      if (appView === 'player' && !settingsOpen) { hidePlayerControls(false); }
    }, delay);
  }

  function playerChapters() {
    return currentPlayback && currentPlayback.chapters ? currentPlayback.chapters : [];
  }

  function ensurePlayerChaptersView() {
    if (!playerChaptersView) {
      playerChaptersView = PlayerChaptersView.create({
        document: document, element: element, t: t, formatTime: formatTime,
        pointerActive: function () { return pointerSelectionActive; },
        ProgressiveImages: ProgressiveImages, posterLoader: posterLoader
      });
    }
    return playerChaptersView;
  }

  function chapterHintVisible() {
    return appView === 'player' && playerControlsMode === 'full' && playerChapters().length > 0 && !chapterState.open;
  }

  function renderChapterHint() {
    var visible = chapterHintVisible();
    if (!visible && playerZone === 'chapter-hint') { playerZone = 'buttons'; playerButtonIndex = 1; }
    ensurePlayerChaptersView().renderHint(visible, visible && playerZone === 'chapter-hint');
  }

  function updateChapterFocus() {
    ensurePlayerChaptersView().updateFocus(chapterState.index, chapterState.open);
  }

  function renderChapterDrawer() {
    ensurePlayerChaptersView().render(playerChapters(), chapterState);
  }

  function openChapterDrawer() {
    var chapters = playerChapters();
    if (!chapters.length) { return; }
    showPlayerControls();
    chapterState = ChapterState.open(chapterState, chapters, playerAbsoluteTime() * 1000);
    playerZone = 'chapters';
    renderChapterHint();
    renderChapterDrawer();
    schedulePlayerControlsTimeout();
  }

  function closeChapterDrawer(restoreFocus) {
    if (!chapterState.open) { return; }
    chapterState = ChapterState.close(chapterState);
    ensurePlayerChaptersView().close();
    playerZone = 'buttons';
    playerButtonIndex = 1;
    renderChapterHint();
    if (restoreFocus) {
      updatePlayerButtonFocus();
      ensurePlayerChaptersView().markHintReturning();
      schedulePlayerControlsTimeout();
    }
  }

  function resetChapterDrawer() {
    chapterState = ChapterState.create();
    ensurePlayerChaptersView().reset();
  }

  function activateChapter() {
    var selection = ChapterState.select(chapterState, playerChapters());
    if (!selection.chapter || selection.seekSeconds === null) { return; }
    seekPlayerTo(selection.seekSeconds);
    closeChapterDrawer(true);
    chapterState = selection.state;
  }

  function applyPlayerControlsMode(mode) {
    playerControlsMode = mode;
    playerControlsVisible = PlayerControlsState.visible(mode);
    ensurePlayerControlsView().renderMode(mode);
    renderChapterHint();
    schedulePlayerControlsTimeout();
  }

  function showPlayerControls() {
    var previousMode = playerControlsMode;
    applyPlayerControlsMode('full');
    playerBackArmed = false;
    if (previousMode !== 'full') { showSkipPromptForControls(); }
    else { renderSkipPrompt(); }
  }

  function showPlayerTimeline() {
    applyPlayerControlsMode('timeline');
    playerBackArmed = false;
    renderSkipPrompt();
  }

  function initializePlayerControlsHidden() {
    root.clearTimeout(playerControlsTimer);
    playerControlsMode = 'hidden';
    playerControlsVisible = false;
    playerBackArmed = false;
    controlsHiddenAt = 0;
    ensurePlayerControlsView().renderMode('hidden');
    resetChapterDrawer();
  }

  function hidePlayerControls(manual) {
    root.clearTimeout(playerControlsTimer);
    closeChapterDrawer(false);
    playerControlsMode = PlayerControlsState.next(playerControlsMode, 'hide');
    playerControlsVisible = false;
    playerBackArmed = !!manual;
    controlsHiddenAt = new Date().getTime();
    ensurePlayerControlsView().renderMode('hidden');
    renderChapterHint();
    hideSkipPromptWithControls();
  }

  function handlePlayerBack() {
    if (autoplayVisible) { cancelAutoplayCountdown(); return; }
    if (chapterState.open) { closeChapterDrawer(true); return; }
    if (settingsOpen) { setSettingsOpen(false); showPlayerControls(); return; }
    if (playerControlsVisible) { hidePlayerControls(true); return; }
    if (skipMarkerState.visible) { dismissSkipPrompt(); return; }
    if (playerBackArmed) { closePlayer(); return; }
    if (new Date().getTime() - controlsHiddenAt < 1000) { return; }
    closePlayer();
  }

  function playerButtonAvailable(index) {
    return ensurePlayerControlsView().buttonAvailable(index);
  }

  function updatePlayerButtonFocus() {
    var buttons = document.querySelectorAll('.player-button');
    var skipButton = document.getElementById('player-skip-marker');
    var chapterHint = document.getElementById('player-chapters-hint');
    var index;
    document.getElementById('player-timeline-button').className = 'player-timeline-button' + (playerZone === 'timeline' ? ' is-focused' : '');
    skipButton.className = playerSkipMarkerClass(!skipMarkerState.visible);
    renderChapterHint();
    for (index = 0; index < buttons.length; index += 1) {
      buttons[index].className = buttons[index].className.replace(/\s*is-focused/g, '') + (playerZone === 'buttons' && index === playerButtonIndex ? ' is-focused' : '');
    }
    if (playerZone === 'chapters') { updateChapterFocus(); }
    else if (playerZone === 'chapter-hint' && chapterHintVisible()) { chapterHint.focus(); }
    else if (playerZone === 'skip' && skipMarkerState.visible) { skipButton.focus(); }
    else if (playerZone === 'timeline') { document.getElementById('player-timeline-button').focus(); }
    else { buttons[playerButtonIndex].focus(); }
  }

  function updateEpisodeCommands() {
    var context = episodeNavigationContext();
    ensurePlayerControlsView().renderEpisodeCommands(!!context && episodeResolver.canMove(context, -1), !!context && episodeResolver.canMove(context, 1));
  }

  function episodeNavigationContext() {
    if (!seriesContext || !seriesContext.seasons || !seriesContext.episodes) { return null; }
    return {
      seasons: seriesContext.seasons,
      seasonIndex: detailSeasonIndex,
      episodes: seriesContext.episodes,
      episodeIndex: detailEpisodeIndex
    };
  }

  function movePlayerButton(direction) {
    var next = playerButtonIndex;
    do { next += direction; } while (next >= 0 && next < 4 && !playerButtonAvailable(next));
    if (next >= 0 && next < 4) { playerButtonIndex = next; }
    updatePlayerButtonFocus();
  }

  function seekPlayer(direction) {
    var step = seekRepeatCount >= 10 ? 60 : (seekRepeatCount >= 4 ? 30 : 10);
    seekRepeatCount += 1;
    seekPlayerTo(playerDisplayTime() + direction * step);
  }

  function trackLabel(tracks, id, offLabel) {
    var index;
    if (!id) { return offLabel; }
    for (index = 0; index < tracks.length; index += 1) {
      if (tracks[index].id === id) { return MediaProfile.trackDisplayLabel(tracks[index], t('detail.external')); }
    }
    return offLabel;
  }

  function playerSettingDisabled(settingKey, advanced) {
    var audioTracks = currentPlayback.audioTracks || [];
    var subtitleTracks = currentPlayback.subtitleTracks || [];
    var mediaVersions = currentPlayback.mediaVersions || [];
    if (settingKey === 'audio') { return audioTracks.length < 2; }
    if (settingKey === 'subtitles') { return subtitleTracks.length === 0; }
    if (settingKey === 'size') { return subtitleTracks.length === 0 || !currentPlayback.options.subtitleStreamID; }
    if (settingKey === 'subtitle-advanced') { return !advanced.enabled; }
    if (settingKey === 'version') { return mediaVersions.length < 2; }
    return false;
  }

  function movePlayerSetting(direction) {
    var rows = document.querySelectorAll('.setting-row');
    var next = settingIndex;
    do { next += direction; } while (next >= 0 && next < rows.length && rows[next].disabled);
    if (next >= 0 && next < rows.length) { settingIndex = next; }
    updateSettingsDisplay();
  }

  function updateSettingsDisplay() {
    var rows = document.querySelectorAll('.setting-row');
    var advanced = subtitleEditorAvailability();
    var disabled;
    var next;
    var settingKey;
    var index;
    setText('setting-audio', trackLabel(currentPlayback.audioTracks, currentPlayback.options.audioStreamID, t('player.automatic')));
    setText('setting-subtitles', trackLabel(currentPlayback.subtitleTracks, currentPlayback.options.subtitleStreamID, t('subtitle.off')));
    setText('setting-size', currentPlayback.options.subtitleSize + '%');
    setText('setting-subtitle-advanced', t(advanced.enabled ? 'player.subtitleAvailable' : 'player.subtitleUnsupported'));
    setText('setting-version', mediaVersionLabelForPlayback());
    setText('setting-quality', videoQualityLabel(currentPlayback.requestedVideoQuality || currentPlayback.options.videoQuality));
    setText('setting-playback-mode', playbackPreferenceLabel(currentPlayback.requestedPlaybackMode || currentPlayback.options.playbackMode));
    renderPlayerPlaybackSummary();
    renderPlaybackInfo();
    for (index = 0; index < rows.length; index += 1) {
      settingKey = rows[index].getAttribute('data-setting');
      disabled = playerSettingDisabled(settingKey, advanced);
      rows[index].disabled = disabled;
      rows[index].className = 'setting-row' +
        (!disabled && settingKey !== 'subtitle-advanced' ? ' is-cycle' : '') +
        (disabled ? ' is-disabled' : '');
    }
    if (!rows[settingIndex] || rows[settingIndex].disabled) {
      next = 0;
      while (next < rows.length && rows[next].disabled) { next += 1; }
      settingIndex = Math.min(next, rows.length - 1);
    }
    for (index = 0; index < rows.length; index += 1) {
      if (index === settingIndex && !rows[index].disabled) { rows[index].className += ' is-focused'; }
    }
    if (rows[settingIndex] && !rows[settingIndex].disabled) { rows[settingIndex].focus(); }
  }

  function formatFileSize(bytes) {
    var value = Number(bytes || 0);
    if (!value) { return t('player.unavailable'); }
    if (value >= 1073741824) { return (value / 1073741824).toFixed(2) + ' GB'; }
    if (value >= 1048576) { return (value / 1048576).toFixed(1) + ' MB'; }
    return Math.round(value / 1024) + ' KB';
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

  function renderPlayerPlaybackSummary() {
    if (!currentPlayback) {
      setText('player-track-audio', t('player.unavailable'));
      setText('player-track-subtitles', t('subtitle.off'));
      setText('player-quality', '');
      setText('player-delivery-mode', '');
      return;
    }
    setText('player-track-audio', trackLabel(currentPlayback.audioTracks, currentPlayback.options.audioStreamID, t('player.automatic')));
    setText('player-track-subtitles', trackLabel(currentPlayback.subtitleTracks, currentPlayback.options.subtitleStreamID, t('subtitle.off')));
    setText('player-quality', t('player.quality') + ': ' + videoQualityLabel(currentPlayback.options.videoQuality));
    setText('player-connection-route', connectionRouteLabel());
    setText('player-delivery-mode', compactPlaybackModeLabel(currentPlayback.playbackMode));
  }

  function renderPlaybackInfo() {
    var fileNode;
    var sourceParts;
    var dynamicRange;
    var isTranscoded;
    if (!currentPlayback) { return; }
    setText('playback-info-file', currentPlayback.fileName || t('player.unavailable'));
    setText('playback-info-size', formatFileSize(currentPlayback.fileSize));
    sourceParts = [];
    if (currentPlayback.sourceWidth && currentPlayback.sourceHeight) { sourceParts.push(currentPlayback.sourceWidth + 'x' + currentPlayback.sourceHeight); }
    if (currentPlayback.originalVideoCodec) { sourceParts.push(String(currentPlayback.originalVideoCodec).toUpperCase()); }
    if (currentPlayback.originalContainer) { sourceParts.push(String(currentPlayback.originalContainer).toUpperCase()); }
    dynamicRange = String(currentPlayback.videoDynamicRange || '');
    if (dynamicRange) { sourceParts.push(dynamicRange); }
    setText('playback-info-source', sourceParts.join(' / ') || t('player.unavailable'));
    isTranscoded = currentPlayback.playbackMode === 'transcode-audio-video' || currentPlayback.playbackMode === 'transcode-video';
    setText('playback-info-hdr', dynamicRange ? t(isTranscoded ? 'player.hdrTranscoded' : 'player.hdrDirect', { range: dynamicRange }) : t('player.sdr'));
    setText('playback-info-mode', playbackModeLabel(currentPlayback.playbackMode));
    renderPlayerPlaybackSummary();
    fileNode = document.getElementById('playback-info-file');
    fileNode.title = currentPlayback.fileName || '';
  }

  function cycleTrack(tracks, currentId, direction, allowOff) {
    var ids = allowOff ? [''] : [];
    var index;
    for (index = 0; index < tracks.length; index += 1) { ids.push(tracks[index].id); }
    index = Math.max(0, ids.indexOf(currentId));
    return ids[Math.max(0, Math.min(ids.length - 1, index + direction))] || '';
  }

  function cycleSetting(direction) {
    var sizes = [75, 100, 125, 150];
    var index;
    var row = document.querySelectorAll('.setting-row')[settingIndex];
    if (!row || row.disabled) { return; }
    if (settingIndex === 0) {
      currentPlayback.options.audioStreamID = cycleTrack(currentPlayback.audioTracks, currentPlayback.options.audioStreamID, direction, false);
      detailPreferenceState.setTrack('audio', trackForId(currentPlayback.audioTracks, currentPlayback.options.audioStreamID), false);
    } else if (settingIndex === 1) {
      currentPlayback.options.subtitleStreamID = cycleTrack(currentPlayback.subtitleTracks, currentPlayback.options.subtitleStreamID, direction, true);
      detailPreferenceState.setTrack('subtitles', trackForId(currentPlayback.subtitleTracks, currentPlayback.options.subtitleStreamID), !currentPlayback.options.subtitleStreamID);
    } else if (settingIndex === 2) {
      index = sizes.indexOf(currentPlayback.options.subtitleSize);
      currentPlayback.options.subtitleSize = sizes[Math.max(0, Math.min(sizes.length - 1, index + direction))];
    } else if (settingIndex === 3) {
      return;
    } else if (settingIndex === 4) {
      cyclePlaybackVersion(direction);
    } else if (settingIndex === 5) {
      currentPlayback.requestedVideoQuality = cycleValue(['original', '12000', '8000', '4000'], currentPlayback.requestedVideoQuality || currentPlayback.options.videoQuality, direction);
    } else {
      currentPlayback.requestedPlaybackMode = cycleValue(['auto', 'direct', 'transcode'], currentPlayback.requestedPlaybackMode || currentPlayback.options.playbackMode, direction);
    }
    updateSettingsDisplay();
  }

  function openChoiceDialog(title, choices, selectedValue, apply, returnFocus) {
    if (!choices || !choices.length) { return; }
    choiceDialogApply = apply || null;
    choiceDialogReturnFocus = returnFocus || null;
    choiceDialogView.open(title, choices, selectedValue);
  }

  function closeChoiceDialog(apply) {
    var selected = choiceDialogView.selected();
    var callback = choiceDialogReturnFocus;
    if (apply && selected && choiceDialogApply) { choiceDialogApply(selected); }
    choiceDialogView.close();
    choiceDialogApply = null;
    choiceDialogReturnFocus = null;
    if (callback) { callback(); }
  }

  function playerTrackChoices(tracks, includeOff) {
    var choices = includeOff ? [{ value: '', label: t('subtitle.off') }] : [];
    (tracks || []).forEach(function (track) {
      choices.push({ value: String(track.id || ''), label: MediaProfile.trackDisplayLabel(track, t('detail.external')) });
    });
    return choices;
  }

  function setPlaybackVersionChoice(value) {
    var versions = currentPlayback.mediaVersions || [];
    var parts = String(value).split(':');
    var index;
    var resolved;
    var override;
    for (index = 0; index < versions.length; index += 1) {
      if (String(versions[index].mediaIndex) === parts[0] && String(versions[index].partIndex) === parts[1]) {
        currentPlayback.options.mediaIndex = versions[index].mediaIndex;
        currentPlayback.options.partIndex = versions[index].partIndex;
        override = detailPreferenceState.ensureOverride();
        override.mediaIndex = versions[index].mediaIndex;
        override.partIndex = versions[index].partIndex;
        applyPlaybackVersion(currentPlayback, versions[index]);
        resolved = MediaPreferences.resolve(currentPlayback, override, appSettings);
        currentPlayback.options.audioStreamID = resolved.audioStreamID;
        currentPlayback.options.subtitleStreamID = resolved.subtitleStreamID;
        return;
      }
    }
  }

  function openPlayerSettingChoice() {
    var row = document.querySelectorAll('.setting-row')[settingIndex];
    var key;
    var choices = [];
    var selected = '';
    var versions;
    if (!row || row.disabled) { return; }
    key = row.getAttribute('data-setting');
    if (key === 'subtitle-advanced') { openSubtitleEditor(); return; }
    if (key === 'audio') {
      choices = playerTrackChoices(currentPlayback.audioTracks, false); selected = currentPlayback.options.audioStreamID;
    } else if (key === 'subtitles') {
      choices = playerTrackChoices(currentPlayback.subtitleTracks, true); selected = currentPlayback.options.subtitleStreamID;
    } else if (key === 'size') {
      choices = [75, 100, 125, 150].map(function (size) { return { value: String(size), label: size + '%' }; }); selected = String(currentPlayback.options.subtitleSize);
    } else if (key === 'version') {
      versions = currentPlayback.mediaVersions || [];
      choices = versions.map(function (version) { return { value: version.mediaIndex + ':' + version.partIndex, label: mediaVersionLabel(version, false) }; });
      selected = currentPlayback.options.mediaIndex + ':' + currentPlayback.options.partIndex;
    } else if (key === 'quality') {
      choices = ['original', '12000', '8000', '4000'].map(function (value) { return { value: value, label: videoQualityLabel(value) }; });
      selected = currentPlayback.requestedVideoQuality || currentPlayback.options.videoQuality;
    } else if (key === 'playback-mode') {
      choices = ['auto', 'direct', 'transcode'].map(function (value) { return { value: value, label: playbackPreferenceLabel(value) }; });
      selected = currentPlayback.requestedPlaybackMode || currentPlayback.options.playbackMode;
    }
    openChoiceDialog(row.firstChild.textContent, choices, selected, function (choice) {
      if (key === 'audio') { currentPlayback.options.audioStreamID = choice.value; detailPreferenceState.setTrack('audio', trackForId(currentPlayback.audioTracks, choice.value), false); }
      else if (key === 'subtitles') { currentPlayback.options.subtitleStreamID = choice.value; detailPreferenceState.setTrack('subtitles', trackForId(currentPlayback.subtitleTracks, choice.value), !choice.value); }
      else if (key === 'size') { currentPlayback.options.subtitleSize = Number(choice.value); }
      else if (key === 'version') { setPlaybackVersionChoice(choice.value); }
      else if (key === 'quality') { currentPlayback.requestedVideoQuality = choice.value; }
      else if (key === 'playback-mode') { currentPlayback.requestedPlaybackMode = choice.value; }
      updateSettingsDisplay();
    }, function () { updateSettingsDisplay(); });
  }

  function mediaVersionLabelForPlayback() {
    var versions = currentPlayback && currentPlayback.mediaVersions || [];
    var index;
    for (index = 0; index < versions.length; index += 1) {
      if (versions[index].mediaIndex === currentPlayback.options.mediaIndex && versions[index].partIndex === currentPlayback.options.partIndex) {
        return mediaVersionLabel(versions[index], false);
      }
    }
    return t('player.versionAuto');
  }

  function cyclePlaybackVersion(direction) {
    var versions = currentPlayback.mediaVersions || [];
    var index = 0;
    var currentIndex;
    var resolved;
    var override;
    if (versions.length < 2) { return; }
    for (currentIndex = 0; currentIndex < versions.length; currentIndex += 1) {
      if (versions[currentIndex].mediaIndex === currentPlayback.options.mediaIndex && versions[currentIndex].partIndex === currentPlayback.options.partIndex) { index = currentIndex; break; }
    }
    index = (index + direction + versions.length) % versions.length;
    currentPlayback.options.mediaIndex = versions[index].mediaIndex;
    currentPlayback.options.partIndex = versions[index].partIndex;
    override = detailPreferenceState.ensureOverride();
    override.mediaIndex = versions[index].mediaIndex;
    override.partIndex = versions[index].partIndex;
    applyPlaybackVersion(currentPlayback, versions[index]);
    resolved = MediaPreferences.resolve(currentPlayback, override, appSettings);
    currentPlayback.options.audioStreamID = resolved.audioStreamID;
    currentPlayback.options.subtitleStreamID = resolved.subtitleStreamID;
  }

  function trackForId(tracks, id) {
    var index;
    for (index = 0; index < (tracks || []).length; index += 1) {
      if (String(tracks[index].id || '') === String(id || '')) { return tracks[index]; }
    }
    return null;
  }
