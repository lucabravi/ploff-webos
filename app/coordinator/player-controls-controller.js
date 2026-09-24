(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffPlayerControlsController = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var timerRoot = values.root || {};
    var ControlsState = values.PlayerControlsState;
    var Chapters = values.ChapterState;
    var SkipMarkers = values.SkipMarkerState;
    var state = {
      mode: 'full',
      visible: true,
      zone: 'buttons',
      buttonIndex: 1,
      hiddenAt: 0,
      backArmed: false,
      settingsOpen: false,
      settingIndex: 0,
      settingsSignature: '',
      chapters: Chapters.create(),
      skip: SkipMarkers.create(),
      pointerActive: false,
      seekRepeatCount: 0,
      destroyed: false
    };
    var controlsTimer = null;
    var skipTimer = null;
    var skipTimerDeadline = 0;

    function call(callback, arg1, arg2, arg3, arg4) {
      if (typeof callback === 'function') { return callback(arg1, arg2, arg3, arg4); }
      return undefined;
    }

    function now() {
      var value = call(values.now);
      return isFinite(Number(value)) ? Number(value) : new Date().getTime();
    }

    function playback() { return call(values.playbackSnapshot) || {}; }
    function queueSnapshot() {
      var queue = values.queueController;
      return queue && typeof queue.snapshot === 'function' ? queue.snapshot() : {};
    }
    function drawerSnapshot() {
      var queue = values.queueController;
      return queue && typeof queue.drawerSnapshot === 'function' ? queue.drawerSnapshot() : {};
    }

    function copySkip(source) {
      return {
        marker: source.marker,
        markerKey: source.markerKey,
        visible: source.visible,
        mode: source.mode,
        deadline: source.deadline,
        focusRequested: source.focusRequested,
        dismissed: source.dismissed,
        consumed: source.consumed === true
      };
    }

    function copyChapters(source) { return { open: source.open, index: source.index, currentIndex: source.currentIndex }; }

    function snapshot() {
      return {
        mode: state.mode,
        visible: state.visible,
        zone: state.zone,
        buttonIndex: state.buttonIndex,
        hiddenAt: state.hiddenAt,
        backArmed: state.backArmed,
        settingsOpen: state.settingsOpen,
        settingIndex: state.settingIndex,
        settingsSignature: state.settingsSignature,
        chapter: copyChapters(state.chapters),
        chapters: copyChapters(state.chapters),
        skip: copySkip(state.skip),
        pointerActive: state.pointerActive,
        seekRepeatCount: state.seekRepeatCount,
        destroyed: state.destroyed
      };
    }

    function renderMode() { call(values.renderMode, state.mode, snapshot()); }
    function renderFocus() { call(values.renderFocus, snapshot()); }
    function renderChapters() { call(values.renderChapters, snapshot()); }
    function renderSkip() { call(values.renderSkip, snapshot()); }
    function renderSettings() { call(values.renderSettings, snapshot()); }

    function clearControlsTimer() {
      if (controlsTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(controlsTimer); }
      controlsTimer = null;
    }

    function clearSkipTimer() {
      if (skipTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(skipTimer); }
      skipTimer = null;
      skipTimerDeadline = 0;
    }

    function scheduleControlsTimeout() {
      var delay;
      clearControlsTimer();
      if (state.destroyed || state.settingsOpen || state.chapters.open || drawerSnapshot().open) { return; }
      delay = ControlsState.timeout(state.mode);
      if (!delay || !timerRoot.setTimeout) { return; }
      controlsTimer = timerRoot.setTimeout(function () {
        controlsTimer = null;
        if (state.destroyed || state.settingsOpen || state.chapters.open || drawerSnapshot().open || call(values.playerActive) === false) { return; }
        hide(false);
      }, delay);
    }

    function scheduleSkipExpiry() {
      var delay;
      if (!state.skip.visible || state.skip.mode !== 'timed') { clearSkipTimer(); return; }
      if (skipTimer !== null && skipTimerDeadline === state.skip.deadline) { return; }
      clearSkipTimer();
      skipTimerDeadline = state.skip.deadline;
      delay = Math.max(0, state.skip.deadline - now());
      if (!timerRoot.setTimeout) { return; }
      skipTimer = timerRoot.setTimeout(function () {
        skipTimer = null;
        skipTimerDeadline = 0;
        if (!state.destroyed) { updateSkip(); }
      }, delay + 20);
    }

    function resetSkip() {
      clearSkipTimer();
      state.skip = SkipMarkers.create();
      if (state.zone === 'skip') { state.zone = 'buttons'; state.buttonIndex = 1; }
      renderSkip();
      renderFocus();
    }

    function upNextActive() {
      var queue = queueSnapshot();
      return !!(queue.upNextVisible || queue.upNextPreparing ||
        queue.upNext && (queue.upNext.visible || queue.upNext.preparing));
    }

    function updateSkip() {
      var current = playback();
      var marker;
      if (state.destroyed || !current.active) { return; }
      if (upNextActive()) { resetSkip(); return; }
      marker = SkipMarkers.activeMarker(current.markers, Number(current.positionSeconds || 0) * 1000);
      state.skip = SkipMarkers.update(
        state.skip,
        current.markers,
        Number(current.positionSeconds || 0) * 1000,
        now(),
        current.skipPromptDuration,
        current.seekSettling === true
      );
      if (marker && state.visible) { state.skip = SkipMarkers.showForControls(state.skip, marker); }
      if (state.skip.focusRequested) {
        state.skip = SkipMarkers.clearFocusRequest(state.skip);
        if (state.mode !== 'timeline' && state.zone !== 'timeline') { state.zone = 'skip'; }
      } else if (!state.skip.visible && state.zone === 'skip') {
        state.zone = 'buttons';
        state.buttonIndex = 1;
      }
      renderSkip();
      renderFocus();
      scheduleSkipExpiry();
    }

    function showSkipForControls() {
      var current = playback();
      var marker;
      if (!current.active) { return; }
      if (upNextActive()) { resetSkip(); return; }
      marker = SkipMarkers.activeMarker(current.markers, Number(current.positionSeconds || 0) * 1000);
      if (!marker) { updateSkip(); return; }
      state.skip = SkipMarkers.showForControls(state.skip, marker);
      if (state.skip.focusRequested) {
        state.skip = SkipMarkers.clearFocusRequest(state.skip);
        state.zone = 'skip';
      }
      renderSkip();
      renderFocus();
      scheduleSkipExpiry();
    }

    function hideSkipWithControls() {
      state.skip = SkipMarkers.hideWithControls(state.skip);
      if (!state.skip.visible && state.zone === 'skip') { state.zone = 'buttons'; state.buttonIndex = 1; }
      renderSkip();
      renderFocus();
      scheduleSkipExpiry();
    }

    function dismissSkip(consumed) {
      state.skip = SkipMarkers.dismiss(state.skip, consumed === true);
      if (state.zone === 'skip') { state.zone = 'buttons'; state.buttonIndex = 1; }
      renderSkip();
      renderFocus();
      scheduleSkipExpiry();
    }

    function activateSkip() {
      var marker = state.skip.marker;
      if (!state.skip.visible || !marker) { return false; }
      dismissSkip(true);
      call(values.seekAbsolute, Number(marker.endTimeOffset || 0) / 1000, { source: 'skip' });
      return true;
    }

    function applyMode(mode) {
      state.mode = mode;
      state.visible = ControlsState.visible(mode);
      renderMode();
      renderChapters();
      renderFocus();
      scheduleControlsTimeout();
    }

    function showFull() {
      var previous = state.mode;
      applyMode('full');
      state.backArmed = false;
      if (previous !== 'full') { showSkipForControls(); }
      else { updateSkip(); }
    }

    function show() { return showFull(); }

    function holdVisible() {
      showFull();
      clearControlsTimer();
    }

    function resumeAutoHide() {
      if (state.destroyed || !state.visible) { return false; }
      scheduleControlsTimeout();
      return true;
    }

    function showTimeline() {
      applyMode('timeline');
      state.backArmed = false;
      updateSkip();
    }

    function closeChapters(restoreFocus) {
      if (!state.chapters.open) { return false; }
      state.chapters = Chapters.close(state.chapters);
      state.zone = 'buttons';
      state.buttonIndex = 1;
      renderChapters();
      renderFocus();
      call(values.onChaptersClosed, restoreFocus === true, snapshot());
      if (restoreFocus) { scheduleControlsTimeout(); }
      return true;
    }

    function resetChapters() {
      state.chapters = Chapters.create();
      if (state.zone === 'chapters' || state.zone === 'chapter-hint') {
        state.zone = 'buttons';
        state.buttonIndex = 1;
      }
      renderChapters();
      renderFocus();
    }

    function hide(manual) {
      clearControlsTimer();
      closeChapters(false);
      state.mode = ControlsState.next(state.mode, 'hide');
      state.visible = false;
      state.backArmed = !!manual;
      state.hiddenAt = now();
      renderMode();
      renderChapters();
      hideSkipWithControls();
    }

    function initializeHidden() {
      clearControlsTimer();
      state.mode = 'hidden';
      state.visible = false;
      state.backArmed = false;
      state.hiddenAt = 0;
      state.zone = 'buttons';
      state.buttonIndex = 1;
      state.settingsOpen = false;
      state.settingIndex = 0;
      resetChapters();
      renderMode();
      renderSettings();
    }

    function chapters() { return playback().chapters || []; }

    function chapterHintVisible() {
      return state.mode === 'full' && chapters().length > 0 && !state.chapters.open;
    }

    function openChapters() {
      var current = playback();
      var list = current.chapters || [];
      if (!list.length) { return false; }
      showFull();
      state.chapters = Chapters.open(state.chapters, list, Number(current.positionSeconds || 0) * 1000);
      state.zone = 'chapters';
      renderChapters();
      renderFocus();
      scheduleControlsTimeout();
      return state.chapters.open;
    }

    function moveChapter(direction) {
      if (!state.chapters.open) { return false; }
      state.chapters = Chapters.move(state.chapters, chapters().length, direction);
      renderFocus();
      return true;
    }

    function pointChapter(index) {
      if (!state.chapters.open) { return false; }
      state.chapters.index = Math.max(0, Math.min(chapters().length - 1, Number(index || 0)));
      state.zone = 'chapters';
      renderFocus();
      return true;
    }

    function activateChapter() {
      var selection = Chapters.select(state.chapters, chapters());
      if (!selection.chapter || selection.seekSeconds === null) { return false; }
      state.chapters = selection.state;
      call(values.seekAbsolute, Number(selection.seekSeconds), { source: 'chapter' });
      state.zone = 'buttons';
      state.buttonIndex = 1;
      renderChapters();
      renderFocus();
      scheduleControlsTimeout();
      return true;
    }

    function buttonCount() {
      var count = Number(call(values.buttonCount));
      return isFinite(count) && count > 0 ? count : 5;
    }

    function buttonAvailable(index) { return call(values.buttonAvailable, index) !== false; }

    function setZone(zone, index) {
      state.zone = zone || 'buttons';
      if (isFinite(Number(index))) { state.buttonIndex = Number(index); }
      renderFocus();
      scheduleControlsTimeout();
    }

    function moveButton(direction) {
      var next = state.buttonIndex;
      var count = buttonCount();
      do { next += direction < 0 ? -1 : 1; }
      while (next >= 0 && next < count && !buttonAvailable(next));
      if (next >= 0 && next < count) { state.buttonIndex = next; }
      renderFocus();
      scheduleControlsTimeout();
      return state.buttonIndex;
    }

    function settingsRows() { return call(values.settingsRows) || []; }

    function firstSelectableSettingIndex(rows) {
      var index;
      for (index = 0; index < rows.length; index += 1) {
        if (!rows[index].disabled) { return index; }
      }
      return 0;
    }

    function setSettingsOpen(open, signature) {
      var currentSignature;
      open = !!open;
      if (!open && state.settingsOpen) {
        currentSignature = String(call(values.settingsSignature) || '');
        if (currentSignature !== state.settingsSignature) { call(values.applySettings); }
      }
      state.settingsOpen = open;
      if (state.settingsOpen) {
        state.settingsSignature = signature === undefined ? String(call(values.settingsSignature) || '') : String(signature || '');
        state.settingIndex = firstSelectableSettingIndex(settingsRows());
      }
      renderSettings();
      renderSkip();
      call(values.onSettingsOpenChanged, state.settingsOpen, state.settingsSignature, snapshot());
      if (state.settingsOpen) { showFull(); }
      else { scheduleControlsTimeout(); }
      return state.settingsOpen;
    }

    function resumeSettings() {
      if (state.destroyed) { return false; }
      state.settingsOpen = true;
      renderSettings();
      showFull();
      return true;
    }

    function setSettingsSignature(signature) {
      state.settingsSignature = String(signature || '');
    }

    function moveSetting(direction) {
      var rows = settingsRows();
      var next = state.settingIndex;
      do { next += direction < 0 ? -1 : 1; }
      while (next >= 0 && next < rows.length && rows[next].disabled);
      if (next >= 0 && next < rows.length) { state.settingIndex = next; }
      renderSettings();
      scheduleControlsTimeout();
      return state.settingIndex;
    }

    function pointSetting(index) {
      var rows = settingsRows();
      var next = Math.max(0, Math.min(rows.length - 1, Number(index || 0)));
      if (rows[next] && !rows[next].disabled) { state.settingIndex = next; }
      renderSettings();
      scheduleControlsTimeout();
      return state.settingIndex;
    }

    function settingKey() {
      var rows = settingsRows();
      return rows[state.settingIndex] && rows[state.settingIndex].key || '';
    }

    function cycleSetting(direction) {
      var key = settingKey();
      if (!key) { return false; }
      if (key === 'audio' || key === 'subtitles') { call(values.changeTrack, key, direction); }
      else if (key === 'version') { call(values.changeVersion, direction); }
      else if (key === 'subtitle-advanced' || key === 'media-info' || key === 'close') { return false; }
      else { call(values.changeSetting, key, direction); }
      renderSettings();
      return true;
    }

    function activateSetting() {
      var key = settingKey();
      if (!key) { return false; }
      if (key === 'close') {
        setSettingsOpen(false);
      } else if (key === 'subtitle-advanced') {
        state.settingsOpen = false;
        renderSettings();
        call(values.openSubtitleEditor);
      } else if (key === 'media-info') {
        state.settingsOpen = false;
        renderSettings();
        call(values.openMediaInfo);
      } else { call(values.openSettingChoice, key, state.settingIndex); }
      return true;
    }

    function relativeSeek(direction) {
      var current = playback();
      var step = state.seekRepeatCount >= 10 ? 60 : (state.seekRepeatCount >= 4 ? 30 : 10);
      var target = Number(current.positionSeconds || 0) + (direction < 0 ? -step : step);
      var duration = Number(current.durationSeconds);
      state.seekRepeatCount += 1;
      if (isFinite(duration) && duration > 0) { target = Math.min(duration, target); }
      target = Math.max(0, target);
      call(values.seekAbsolute, target, { source: 'remote' });
      return target;
    }

    function resetSeekRepeat() { state.seekRepeatCount = 0; }

    function pointerSeek(seconds) {
      var target = Number(seconds);
      if (!isFinite(target)) { return null; }
      target = Math.max(0, target);
      call(values.seekAbsolute, target, { source: 'pointer' });
      return target;
    }

    function handleBack() {
      var queue = queueSnapshot();
      var drawer = drawerSnapshot();
      if (drawer.open || queue.drawer && queue.drawer.open) {
        call(values.closeQueue, true);
        return 'queue';
      }
      if (queue.upNextVisible || queue.upNext && queue.upNext.visible) {
        call(values.cancelUpNext, true);
        return 'up-next';
      }
      if (state.chapters.open) { closeChapters(true); return 'chapters'; }
      if (state.settingsOpen) { setSettingsOpen(false); showFull(); return 'settings'; }
      if (state.visible) { hide(true); return 'controls'; }
      if (state.skip.visible) { dismissSkip(); return 'skip'; }
      if (state.backArmed) { call(values.closePlayer); return 'player'; }
      if (now() - state.hiddenAt < 1000) { return 'grace'; }
      call(values.closePlayer);
      return 'player';
    }

    function buttonAction(index) {
      var action = call(values.buttonAction, index);
      if (action) { return action; }
      if (index === 0) { return 'previous'; }
      if (index === 2) { return 'next'; }
      if (index === 3) { return 'queue'; }
      if (index === 4) { return 'settings'; }
      return 'toggle';
    }

    function activateButton() {
      var action = buttonAction(state.buttonIndex);
      if (action === 'previous') { call(values.startAdjacent || values.switchEpisode, -1); }
      else if (action === 'next') { call(values.startAdjacent || values.switchEpisode, 1); }
      else if (action === 'queue') { call(values.openQueue); }
      else if (action === 'settings') { setSettingsOpen(true); }
      else { call(values.toggle); }
      return action;
    }

    function handleChaptersKey(code) {
      if (code === 37 || code === 39) { moveChapter(code === 37 ? -1 : 1); }
      else {
        showFull();
        if (code === 38) { closeChapters(true); }
        else if (code === 13) { activateChapter(); }
      }
      return true;
    }

    function handleSettingsKey(code) {
      showFull();
      if (code === 38) { moveSetting(-1); }
      else if (code === 40) { moveSetting(1); }
      else if (code === 37) { cycleSetting(-1); }
      else if (code === 39) { cycleSetting(1); }
      else if (code === 13) { activateSetting(); }
      return true;
    }

    function handleCompactModeKey(code) {
      if (state.mode === 'hidden' && code === 13) {
        state.mode = ControlsState.next(state.mode, 'ok');
        state.zone = 'buttons';
        state.buttonIndex = 1;
        showFull();
        return true;
      }
      if (state.mode !== 'full' && (code === 37 || code === 39 || code === 412 || code === 417)) {
        state.mode = ControlsState.next(state.mode, 'seek');
        state.zone = 'timeline';
        relativeSeek(code === 37 || code === 412 ? -1 : 1);
        showTimeline();
        return true;
      }
      if (state.mode === 'timeline' && code === 13) {
        state.mode = ControlsState.next(state.mode, 'ok');
        state.zone = 'buttons';
        state.buttonIndex = 1;
        showFull();
        return true;
      }
      if (state.mode !== 'full' && (code === 38 || code === 40)) {
        state.mode = ControlsState.next(state.mode, 'navigate');
        state.zone = 'buttons';
        state.buttonIndex = 1;
        showFull();
        return true;
      }
      return false;
    }

    function handleSkipKey(code) {
      if (code === 13) {
        activateSkip();
        return true;
      }
      if (code === 37 || code === 39) {
        scheduleSkipExpiry();
        return true;
      }
      if (state.mode !== 'full') { return false; }
      if (code === 38 || code === 40) {
        showFull();
        setZone('timeline');
        return true;
      }
      return false;
    }

    function handleTimelineKey(code) {
      if (code === 38) {
        showFull();
        setZone(state.skip.visible ? 'skip' : 'timeline');
        return true;
      }
      if (code === 40) {
        showFull();
        setZone('buttons');
        return true;
      }
      if (code === 37 || code === 39) {
        showFull();
        relativeSeek(code === 37 ? -1 : 1);
        return true;
      }
      if (code === 13) {
        showFull();
        return true;
      }
      return false;
    }

    function handleButtonsKey(code) {
      if (code === 40 && chapters().length) {
        openChapters();
        return true;
      }
      if (code === 38) {
        showFull();
        setZone('timeline');
        return true;
      }
      if (code === 40) {
        showFull();
        setZone('buttons');
        return true;
      }
      if (code === 37 && chapterHintVisible() &&
          (state.buttonIndex === 0 || (state.buttonIndex === 1 && !buttonAvailable(0)))) {
        showFull();
        setZone('chapter-hint');
        return true;
      }
      if (code === 37 || code === 39) {
        showFull();
        moveButton(code === 37 ? -1 : 1);
        return true;
      }
      if (code === 13) {
        showFull();
        activateButton();
        return true;
      }
      return false;
    }

    function handleChapterHintKey(code) {
      if (code === 40 && chapters().length) {
        openChapters();
        return true;
      }
      if (code === 38) {
        showFull();
        setZone('timeline');
        return true;
      }
      if (code === 40 || code === 39) {
        showFull();
        setZone('buttons', code === 39 && buttonAvailable(0) ? 0 : 1);
        return true;
      }
      if (code === 13) {
        showFull();
        openChapters();
        return true;
      }
      return false;
    }

    function handleKey(event, _direction) {
      var code = Number(event && event.keyCode || 0);
      var current = playback();
      if (state.destroyed || !current.active) { return false; }
      if (code === 27 || code === 461) { handleBack(); return true; }
      if (code === 415) { call(values.mediaPlay || values.play); return true; }
      if (code === 19) { call(values.mediaPause || values.pause); return true; }
      if (state.chapters.open) { return handleChaptersKey(code); }
      if (code === 413) { call(values.closePlayer); return true; }
      if (state.settingsOpen) { return handleSettingsKey(code); }
      if (code === 13 && state.mode !== 'full' && state.skip.visible && activateSkip()) { return true; }
      if (state.zone === 'skip' && handleSkipKey(code)) { return true; }
      if (handleCompactModeKey(code)) { return true; }
      if (state.zone === 'timeline' && handleTimelineKey(code)) { return true; }
      if (state.zone === 'buttons' && handleButtonsKey(code)) { return true; }
      if (state.zone === 'chapter-hint' && handleChapterHintKey(code)) { return true; }
      if (code === 412 || code === 417) {
        showFull();
        relativeSeek(code === 412 ? -1 : 1);
        return true;
      }
      return false;
    }

    function pointerFocus(zone, index) {
      state.pointerActive = true;
      if (zone === 'chapter' || zone === 'chapters') { pointChapter(index); }
      else if (zone === 'setting' || zone === 'settings') { pointSetting(index); }
      else if (zone === 'button') { setZone('buttons', index); }
      else { setZone(zone, index); }
      state.pointerActive = false;
      return snapshot();
    }

    function pointerActivity() {
      if (state.mode === 'timeline' && !state.settingsOpen) {
        state.mode = ControlsState.next(state.mode, 'pointer');
        state.zone = 'buttons'; state.buttonIndex = 1;
        showFull();
      }
      return snapshot();
    }

    function focus(zone, index) { setZone(zone, index); return snapshot(); }
    function focusSetting(index) { return pointSetting(index); }

    function applySettingChoice(kind, value) {
      if (kind === 'audio' || kind === 'subtitles') { call(values.changeTrack, kind, value); }
      else if (kind === 'version') { call(values.changeVersion, value); }
      else { call(values.changeSetting, kind, value); }
      renderSettings();
      return true;
    }

    function reset() {
      clearControlsTimer();
      clearSkipTimer();
      state.mode = 'full';
      state.visible = true;
      state.zone = 'buttons';
      state.buttonIndex = 1;
      state.hiddenAt = 0;
      state.backArmed = false;
      state.settingsOpen = false;
      state.settingIndex = 0;
      state.settingsSignature = '';
      state.chapters = Chapters.create();
      state.skip = SkipMarkers.create();
      state.pointerActive = false;
      state.seekRepeatCount = 0;
      renderMode(); renderChapters(); renderSkip(); renderSettings(); renderFocus();
    }

    function destroy() {
      if (state.destroyed) { return; }
      state.destroyed = true;
      clearControlsTimer();
      clearSkipTimer();
    }

    return {
      snapshot: snapshot,
      reset: reset,
      show: show,
      showFull: showFull,
      holdVisible: holdVisible,
      resumeAutoHide: resumeAutoHide,
      hide: hide,
      initializeHidden: initializeHidden,
      cancelControlsTimeout: clearControlsTimer,
      updateSkip: updateSkip,
      resetSkip: resetSkip,
      chapterHintVisible: chapterHintVisible,
      openChapters: openChapters,
      closeChapters: closeChapters,
      resetChapters: resetChapters,
      moveChapter: moveChapter,
      activateChapter: activateChapter,
      setZone: setZone,
      focus: focus,
      setSettingsOpen: setSettingsOpen,
      setSettingsSignature: setSettingsSignature,
      moveSetting: moveSetting,
      focusSetting: focusSetting,
      resumeSettings: resumeSettings,
      applySettingChoice: applySettingChoice,
      cycleSetting: cycleSetting,
      seekRelative: relativeSeek,
      pointerSeek: pointerSeek,
      resetSeekRepeat: resetSeekRepeat,
      handleBack: handleBack,
      handleKey: handleKey,
      pointerFocus: pointerFocus,
      pointerActivity: pointerActivity,
      destroy: destroy
    };
  }

  return { create: create };
}));
