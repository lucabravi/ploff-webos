(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffPlaybackController = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var timerRoot = values.root || {};
    var assColdStartMetrics = timerRoot.PloffAssSubtitleColdStartMetrics || null;
    var debugCapture = timerRoot.PloffDebugCapture || null;
    var NativeVideoDriver = values.NativeVideoDriver;
    var videoDriver = NativeVideoDriver && NativeVideoDriver.create ? NativeVideoDriver.create(values.video) : null;
    var PlexClient = values.PlexClient;
    var PlaybackClock = values.PlaybackClock;
    var PlaybackRecovery = values.PlaybackRecovery;
    var PlaybackReposition = values.PlaybackReposition;
    var PlaybackSession = values.PlaybackSession;
    var PlaybackTimeline = values.PlaybackTimeline;
    var PlaybackStrategy = values.PlaybackStrategy;
    var PlayerSeekController = values.PlayerSeekController;
    var PlayerTimelinePolicy = values.PlayerTimelinePolicy;
    var PlayerBufferingIndicator = values.PlayerBufferingIndicator;
    var SubtitleSync = values.SubtitleSync;
    var SubtitleRuntime = values.SubtitleRuntime;
    var SubtitleEditorSession = values.SubtitleEditorSession;
    var SubtitleOffsetStore = values.SubtitleOffsetStore;
    var AssSubtitlePrefetch = values.AssSubtitlePrefetch;
    var compatibilityMemory = values.compatibilityMemory;
    var config = values.config || {};
    var storage = values.storage;
    var playback = null;
    var recovery = PlaybackRecovery.create([]);
    var reposition = PlaybackReposition && PlaybackReposition.create ? PlaybackReposition.create({
      PlaybackClock: PlaybackClock,
      PlayerSeekController: PlayerSeekController
    }) : null;
    var playbackSession = PlaybackSession && PlaybackSession.create ? PlaybackSession.create() : null;
    var timeline = PlaybackTimeline && PlaybackTimeline.create ? PlaybackTimeline.create({
      PlaybackClock: PlaybackClock,
      PlayerTimelinePolicy: PlayerTimelinePolicy,
      PlexClient: PlexClient,
      config: config,
      root: timerRoot,
      renderProgress: values.renderProgress,
      updateEstimatedEnd: values.updateEstimatedEnd
    }) : null;
    var nativeSeekVerificationTimer = null;
    var clockRepairTimer = null;
    var clockRepairFallbackTimer = null;
    var bufferResumeTimer = null;
    var bufferResumeGeneration = 0;
    var clockRepairGeneration = 0;
    var clockRepairCount = 0;
    var resumeTimer = null;
    var recoveryTimer = null;
    var pendingSeek = null;
    var seekTimer = null;
    var pendingRestore = null;
    var localSubtitleRequest = null;
    var localSubtitleGeneration = 0;
    var localSubtitleLoading = false;
    var subtitleEditorState = null;
    var subtitleEditorRequest = null;
    var subtitleEditorGeneration = 0;
    var subtitlePreviewTimer = null;
    var playbackLoadRequest = null;
    var playbackLoadGeneration = 0;
    var playbackPrepareRequest = null;
    var recoveryTrace = '';
    var rebuildReason = '';
    var generation = 0;
    var debugSourceGeneration = 0;
    var debugBufferGeneration = 0;
    var debugPendingBufferSignal = '';
    var listeners = [];
    var networkUnsubscribe = null;
    var visibilityTarget = values.document || null;
    var subtitleRuntime = SubtitleRuntime && SubtitleRuntime.create ? SubtitleRuntime.create({
      SubtitleSync: SubtitleSync,
      SubtitleOffsetStore: SubtitleOffsetStore,
      AssSubtitleRenderer: values.AssSubtitleRenderer,
      root: timerRoot,
      document: visibilityTarget,
      videoDimensions: videoDriver && videoDriver.dimensions,
      subtitleRendering: values.subtitleRendering,
      subtitlePresentation: values.subtitlePresentation,
      subtitleIdentity: subtitleIdentity,
      storage: storage,
      renderText: values.renderSubtitleOverlay,
      hideText: values.hideSubtitleOverlay,
      onAssRuntimeError: handleAssRuntimeError
    }) : null;
    var TERMINAL_PAUSE_WINDOW_SECONDS = 5;
    var TERMINAL_DIRECT_LOOKBACK_SECONDS = 11;
    var TERMINAL_DIRECT_WINDOW_SECONDS = 10;
    var SUBTITLE_NATIVE_CLOCK_TOLERANCE_SECONDS = 2;
    var BUFFER_RESUME_BACKWARD_TOLERANCE_SECONDS = 2;
    var BUFFER_RESUME_FORWARD_LIMIT_SECONDS = 5;
    var BUFFER_RESUME_SETTLEMENT_DELAY_MS = 400;
    var compatibilityAttemptToken = 0;
    var compatibilityRecordedToken = 0;
    var directFailureNotifiedToken = 0;

    function call(callback, arg1, arg2, arg3, arg4, arg5) {
      if (typeof callback === 'function') { return callback(arg1, arg2, arg3, arg4, arg5); }
      return undefined;
    }

    function traceRecovery(token) {
      var value = String(token || '');
      if (!value) { return; }
      if (!recoveryTrace) { recoveryTrace = value; }
      else if (recoveryTrace.slice(-(value.length + 3)) !== ' > ' + value && recoveryTrace !== value) { recoveryTrace += ' > ' + value; }
      if (playback) { playback.diagnosticRecoveryTrace = recoveryTrace; }
    }

    function traceDelivery(delivery) {
      var value = String(delivery || '');
      traceRecovery(value === 'direct-play' ? 'DP' : (value === 'direct-stream' ? 'DS' : (/^transcode|safe-transcode/.test(value) ? 'TC' : value.toUpperCase())));
    }

    function recoveryRebuild(target, reason) {
      var previous = rebuildReason;
      rebuildReason = String(reason || 'rebuild');
      try { return rebuild(target); }
      finally { rebuildReason = previous; }
    }

    function cancelPlaybackLoadRequest() {
      var request = playbackLoadRequest;
      playbackLoadGeneration += 1;
      playbackLoadRequest = null;
      if (request && request.abort) { request.abort(); }
    }

    function cancelPlaybackPrepareRequest() {
      var request = playbackPrepareRequest;
      playbackPrepareRequest = null;
      if (request && request.abort) { request.abort(); }
    }

    function active() {
      return !playbackSession.destroyed() && (!values.isActive || values.isActive() !== false);
    }

    function copyObject(source) {
      var result = {};
      var key;
      source = source || {};
      for (key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) { result[key] = source[key]; }
      }
      return result;
    }

    function trackForId(tracks, id) {
      var index;
      for (index = 0; index < (tracks || []).length; index += 1) {
        if (String(tracks[index].id || '') === String(id || '')) { return tracks[index]; }
      }
      return null;
    }

    function ranges(source) {
      var result = [];
      var index;
      if (!source) { return result; }
      for (index = 0; index < source.length; index += 1) {
        result.push({ start: source.start(index), end: source.end(index) });
      }
      return result;
    }

    function setStatus(key, detail) { call(values.setStatus, key, detail); }
    function setLoading(loading, preserveFrame) { call(values.setLoading, loading, preserveFrame === true); }
    function durationSeconds() { return playback ? Number(playback.duration || 0) / 1000 : 0; }

    function requestNativePlay() {
      var result;
      if (!videoDriver || !videoDriver.paused() || playbackSession.nativePlayPending()) { return false; }
      playbackSession.beginNativePlay();
      debugPlayback('native-play-request');
      try {
        result = videoDriver.play();
        if (result && typeof result.catch === 'function') {
          result.catch(function () { playbackSession.finishNativePlay(); });
        }
        return true;
      } catch (error) {
        playbackSession.finishNativePlay();
        return false;
      }
    }

    function terminalStreamStart(position) {
      var target = Math.max(0, Number(position || 0));
      var duration = durationSeconds();
      if (!isFinite(duration) || duration <= TERMINAL_DIRECT_LOOKBACK_SECONDS || !isTerminalDirectWindow(target)) { return target; }
      return Math.max(0, Math.floor(duration - TERMINAL_DIRECT_LOOKBACK_SECONDS));
    }

    function isTerminalDirectWindow(position) {
      var duration = durationSeconds();
      var target = Number(position);
      var remaining = duration - target;
      return duration > TERMINAL_DIRECT_LOOKBACK_SECONDS && isFinite(target) && remaining >= 0 && remaining <= TERMINAL_DIRECT_WINDOW_SECONDS;
    }

    function terminalNativeTarget(position, streamStart) {
      return Math.max(0, Number(position || 0) - Number(streamStart || 0));
    }

    function usesOffsetStream(step) {
      return !!step && step.kind !== 'direct-play';
    }

    function terminalNativeEndTarget() {
      var target = Number(playback && playback.terminalNativeSeekTarget);
      var nativeDuration = Number(videoDriver && videoDriver.duration());
      if (!isFinite(target) || target <= 0) { target = nativeDuration; }
      if (isFinite(nativeDuration) && nativeDuration > 0) { target = Math.min(target, nativeDuration); }
      return Math.max(0, target - 0.05);
    }

    function isTerminalPauseTarget(position) {
      var duration = durationSeconds();
      var target = Number(position);
      var remaining = duration - target;
      return duration > TERMINAL_PAUSE_WINDOW_SECONDS && isFinite(target) && remaining >= 0 && remaining <= TERMINAL_PAUSE_WINDOW_SECONDS;
    }

    function publicTime(value) {
      return timeline.publicTime(value === undefined ? displayTime() : value, durationSeconds(), playbackSession.terminalPlayback());
    }

    function renderProgress(position, duration) {
      var total = duration === undefined ? durationSeconds() : Number(duration || 0);
      timeline.renderProgress(position === undefined ? displayTime() : position, total, playbackSession.terminalPlayback(), snapshot());
    }
    function renderPlaybackInfo() { call(values.renderPlaybackInfo, playback, snapshot()); }
    function updateEstimatedEnd() { timeline.updateEstimatedEnd(displayTime(), durationSeconds(), playbackSession.terminalPlayback(), snapshot()); }
    function notifyState() { call(values.onState, snapshot()); }

    function startKeepalive() {
      var current = playback;
      return timeline.startKeepalive(current, function () { return active() && playback === current; });
    }

    function startReporting() {
      return timeline.startReporting({
        current: function () { return playback; },
        state: function () { return videoDriver && videoDriver.paused() ? 'paused' : 'playing'; },
        reportPosition: absoluteTime,
        estimatedPosition: displayTime,
        duration: durationSeconds,
        terminal: playbackSession.terminalPlayback,
        snapshot: snapshot
      });
    }

    function rawNativeTime() {
      var value;
      if (!videoDriver || typeof videoDriver.currentTime !== 'function') { return null; }
      value = videoDriver.currentTime();
      if (value === null || value === undefined || value === '') { return null; }
      value = Number(value);
      return isFinite(value) ? value : null;
    }

    function currentOffsetBase() {
      var value = Number(playback && playback.offsetBase);
      return isFinite(value) ? value : 0;
    }

    function debugCaptureActive() {
      debugCapture = debugCapture || timerRoot.PloffDebugCapture || null;
      return !!(debugCapture && typeof debugCapture.isActive === 'function' && debugCapture.isActive());
    }

    function debugPlayback(event, extra) {
      var nativeTime;
      var offsetBase;
      var localState;
      var checkpoint;
      var payload;
      var key;
      if (!debugCaptureActive() || typeof debugCapture.record !== 'function') { return false; }
      nativeTime = rawNativeTime();
      offsetBase = currentOffsetBase();
      localState = subtitleRuntime && typeof subtitleRuntime.localSnapshot === 'function' ? subtitleRuntime.localSnapshot() : null;
      checkpoint = playbackSession && typeof playbackSession.bufferCheckpoint === 'function' ? playbackSession.bufferCheckpoint() : null;
      payload = {
        playbackGeneration: generation,
        sourceGeneration: debugSourceGeneration,
        bufferGeneration: debugBufferGeneration,
        recoveryGeneration: bufferResumeGeneration,
        readyState: videoDriver ? videoDriver.readyState() : 0,
        networkState: videoDriver ? videoDriver.networkState() : 0,
        nativeTime: nativeTime,
        nativeAbsoluteTime: nativeTime === null ? null : offsetBase + nativeTime,
        publicTime: timeline ? timeline.position() : 0,
        subtitleTime: localState ? Math.max(0, (timeline ? timeline.position() : 0) - Number(localState.offsetMs || 0) / 1000) : (timeline ? timeline.position() : 0),
        offsetBase: offsetBase,
        paused: !!(videoDriver && videoDriver.paused()),
        buffering: !!(playbackSession && playbackSession.buffering()),
        streamSwitching: !!(playbackSession && playbackSession.streamSwitching()),
        nativeSeekPending: !!(playbackSession && playbackSession.nativeSeekPending()),
        nativePlayPending: !!(playbackSession && playbackSession.nativePlayPending()),
        nativeSourceReady: !!(playbackSession && playbackSession.nativeSourceReady()),
        decoderSettlementPending: !!(reposition && reposition.pending()),
        terminalPlayback: !!(playbackSession && playbackSession.terminalPlayback()),
        clockRepairCount: clockRepairCount,
        lifecycle: playbackSession ? playbackSession.lifecycle() : '',
        delivery: playback && playback.options ? String(playback.options.delivery || '') : '',
        subtitleRenderMode: playback ? subtitleRenderMode(playback) : 'off',
        rendererType: localState ? String(localState.rendererType || '') : '',
        bufferStartNative: checkpoint && checkpoint.nativeTime !== undefined ? checkpoint.nativeTime : null,
        bufferStartPublic: checkpoint && checkpoint.absoluteTime !== undefined ? checkpoint.absoluteTime : null,
        bufferStartOffsetBase: checkpoint && checkpoint.offsetBase !== undefined ? checkpoint.offsetBase : null
      };
      extra = extra || {};
      for (key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) { payload[key] = extra[key]; }
      }
      return debugCapture.record('playback', event, payload);
    }

    function clearBufferResumeTimer() {
      if (bufferResumeTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(bufferResumeTimer); }
      bufferResumeTimer = null;
      bufferResumeGeneration += 1;
    }

    function anchorClock(absolute, frozen) {
      clearBufferResumeTimer();
      if (resumeTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(resumeTimer); }
      resumeTimer = null;
      if (clockRepairTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(clockRepairTimer); }
      if (clockRepairFallbackTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(clockRepairFallbackTimer); }
      clockRepairTimer = null;
      clockRepairFallbackTimer = null;
      clockRepairGeneration += 1;
      playbackSession.finishNativeSeek();
      playbackSession.finishNativePlay();
      if (nativeSeekVerificationTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(nativeSeekVerificationTimer); }
      nativeSeekVerificationTimer = null;
      reposition.clear();
      playbackSession.setDecoderReportPending(false);
      timeline.anchor(absolute, frozen);
    }

    function finishTerminalPause() {
      if (!playback || !playback.terminalEndPause || playbackSession.terminalPlayback()) { return false; }
      if (resumeTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(resumeTimer); }
      resumeTimer = null;
      if (nativeSeekVerificationTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(nativeSeekVerificationTimer); }
      nativeSeekVerificationTimer = null;
      playbackSession.finishNativeSeek();
      try { videoDriver.pause(); } catch (error) {}
      playbackSession.finishStreamSwitch();
      retireBufferingIncident('terminal-pause', true);
      timeline.freeze(true);
      playback.terminalEndPause = false;
      playback.terminalSeekTarget = null;
      playback.terminalNativeSeekTarget = null;
      playbackSession.markTerminalPlayback(true);
      setLoading(false);
      setStatus('ended');
      timeline.setSuppressed(false);
      renderProgress(durationSeconds(), durationSeconds());
      report('stopped');
      call(values.onEnded, snapshot());
      notifyState();
      return true;
    }

    function armNativeSeekVerification(absoluteTarget, nativeTarget) {
      if (nativeSeekVerificationTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(nativeSeekVerificationTimer); }
      playbackSession.beginNativeSeek(nativeTarget, absoluteTarget);
      if (!timerRoot.setTimeout) { return; }
      nativeSeekVerificationTimer = timerRoot.setTimeout(function () {
        var targetReached;
        nativeSeekVerificationTimer = null;
        if (!playbackSession.nativeSeekPending() || !active() || !playback) { return; }
        targetReached = reposition.reached(playbackSession.nativeSeekTarget(), videoDriver.currentTime());
        if (targetReached && !playback.terminalEndPause && !playbackSession.streamSwitching() && playback.options.delivery !== 'direct-play') {
          // The verification timer substitutes for a missing seeked event. Keep the
          // absolute/native target until that same completion path has consumed it.
          onSeeked();
          return;
        }
        playbackSession.finishNativeSeek();
        if (playback.terminalEndPause) {
          finishTerminalPause();
          return;
        }
        if (targetReached) {
          if (playbackSession.streamSwitching()) { resumeRebuiltStream(); }
          else { onSeeked(); }
          return;
        }
        recoveryRebuild(absoluteTarget, 'seek-timeout');
      }, 5000);
    }

    function scheduleClockRepair() {
      var repairGeneration;
      if (clockRepairTimer || clockRepairFallbackTimer || bufferResumeTimer || playbackSession.buffering() || playbackSession.streamSwitching() || playbackSession.nativeSeekPending() || !playbackSession.clockRepairAvailable()) { return; }
      repairGeneration = clockRepairGeneration;
      if (!timerRoot.setTimeout) { return; }
      clockRepairTimer = timerRoot.setTimeout(function () {
        var observation;
        var target;
        clockRepairTimer = null;
        if (!active() || !playback || playbackSession.buffering() || playbackSession.streamSwitching() || playbackSession.nativeSeekPending() || repairGeneration !== clockRepairGeneration || !playbackSession.clockRepairAvailable()) { return; }
        observation = timeline.observe(Number(playback.offsetBase || 0), Number(videoDriver.currentTime() || 0), false);
        if (!observation.desynced) { return; }
        target = observation.time;
        if (reposition.repair({
          directPlay: playback.options.delivery === 'direct-play',
          nativeTime: Number(videoDriver.currentTime() || 0),
          buffered: ranges(videoDriver.buffered())
        }) === 'rebuild' && playbackSession.consumeClockRepair()) {
          clockRepairCount += 1;
          recoveryRebuild(target, 'clock-repair');
        }
      }, 400);
    }

    function armDecoderSettlement(target, kind, holdReport) {
      var offset = playback && playback.options.delivery !== 'direct-play' ? currentOffsetBase() : undefined;
      var result = reposition.arm(target, kind, holdReport, offset);
      debugPlayback('decoder-settlement-start', { recoveryTarget: target, reason: String(kind || '') });
      return result;
    }

    function settleDecoder(nativeTime) {
      var result;
      if (!playback) { return false; }
      debugPlayback('decoder-settlement-sample', { nativeTime: Number(nativeTime) });
      result = timeline.settle(reposition.settle, {
        directPlay: playback.options.delivery === 'direct-play',
        offset: Number(playback.offsetBase || 0),
        nativeTime: playback.options.delivery === 'direct-play' ? nativeTime : rawNativeTime(),
        buffered: ranges(videoDriver.buffered()),
        seekable: ranges(videoDriver.seekable())
      });
      if (result.settled) {
        debugPlayback('decoder-settlement-end', { accepted: true, publicTime: timeline.position() });
        if (subtitleRuntime && typeof subtitleRuntime.discontinuity === 'function') {
          debugPlayback('ass-discontinuity', { reason: 'decoder-settlement', recoveryTarget: timeline.position() });
          subtitleRuntime.discontinuity(timeline.position(), subtitleEditorState);
        }
      }
      return result.settled;
    }

    function releaseDecoderReport() {
      if (reposition.pending() || !playbackSession.decoderReportPending() || clockRepairTimer || clockRepairFallbackTimer || bufferResumeTimer || playbackSession.buffering()) { return false; }
      playbackSession.setDecoderReportPending(false);
      setLoading(false);
      report('playing');
      return true;
    }

    function absoluteTime() {
      var observation;
      if (!playback) { return 0; }
      if (playbackSession.streamSwitching() || playbackSession.buffering() || playbackSession.nativeSeekPending()) { return timeline.position(); }
      if (reposition.pending() && settleDecoder(videoDriver.currentTime())) {
        return timeline.position();
      }
      observation = timeline.observe(Number(playback.offsetBase || 0), Number(videoDriver.currentTime() || 0), false);
      if (observation.desynced) { scheduleClockRepair(); }
      return observation.time;
    }

    function displayTime() {
      return pendingSeek === null ? absoluteTime() : pendingSeek;
    }

    function report(stateName, callback) {
      var current = playback;
      var position = absoluteTime();
      return timeline.report(current, stateName, position, durationSeconds(), playbackSession.terminalPlayback(), callback);
    }

    function assessBufferResume() {
      return PlaybackClock.assessBufferResume(
        playbackSession.bufferCheckpoint(),
        currentOffsetBase(),
        rawNativeTime(),
        {
          backwardTolerance: BUFFER_RESUME_BACKWARD_TOLERANCE_SECONDS,
          forwardLimit: BUFFER_RESUME_FORWARD_LIMIT_SECONDS
        }
      );
    }

    function bufferRecoveryResult(assessment, reason, initialReason) {
      var result = copyObject(assessment || {});
      var checkpoint = playbackSession.bufferCheckpoint();
      if (reason) { result.reason = reason; }
      if (initialReason && initialReason !== result.reason) { result.initialReason = initialReason; }
      if (checkpoint) {
        if (checkpoint.nativeTime !== undefined) { result.bufferStartNative = checkpoint.nativeTime; }
        if (checkpoint.absoluteTime !== undefined) { result.bufferStartPublic = checkpoint.absoluteTime; }
        if (checkpoint.offsetBase !== undefined) { result.bufferStartOffsetBase = checkpoint.offsetBase; }
      }
      return result;
    }

    function retireBufferingIncident(reason, accepted) {
      var checkpoint = playbackSession.bufferCheckpoint();
      var nativeTime = rawNativeTime();
      var offsetBase = currentOffsetBase();
      var target = checkpoint && checkpoint.absoluteTime !== undefined ? checkpoint.absoluteTime : timeline.position();
      var candidate = nativeTime === null ? null : Math.max(0, offsetBase + nativeTime);
      var result = bufferRecoveryResult({
        accepted: accepted === true,
        reason: reason || 'retired',
        target: target,
        candidate: candidate,
        delta: candidate === null || target === null || target === undefined ? null : candidate - Number(target),
        nativeTime: nativeTime,
        offsetBase: offsetBase
      }, reason || 'retired');
      stopBuffering(result, true);
      return result;
    }

    function stopBuffering(result, keepFrozen) {
      var wasBuffering = playbackSession.buffering();
      clearBufferResumeTimer();
      if (wasBuffering) {
        debugPlayback('buffer-finish', { accepted: result && result.accepted === true, reason: result && result.reason || '', initialReason: result && result.initialReason || '', recoveryCandidate: result && result.candidate, recoveryTarget: result && result.target, recoveryDelta: result && result.delta });
        playbackSession.finishBuffering(result);
      }
      if (wasBuffering && keepFrozen !== true) { timeline.freeze(false); }
      if (bufferingIndicator) { bufferingIndicator.stop(); }
      if (wasBuffering) { setLoading(false); }
    }

    function beginBufferingIncident() {
      var signal = String(debugPendingBufferSignal || 'unknown');
      debugPendingBufferSignal = '';
      var started = !playbackSession.buffering();
      if (started) {
        debugBufferGeneration += 1;
        clearBufferResumeTimer();
        playbackSession.beginBuffering({
          absoluteTime: timeline.position(),
          nativeTime: rawNativeTime(),
          offsetBase: currentOffsetBase()
        });
      }
      debugPlayback(started ? 'buffer-start' : 'buffer-signal', { signal: String(signal || 'unknown') });
      timeline.freeze(true);
      syncAssPlaybackClock(true);
      if (bufferingIndicator) { bufferingIndicator.signal(); }
      notifyState();
    }

    function pauseBufferingIncident() {
      clearBufferResumeTimer();
      if (bufferingIndicator) { bufferingIndicator.stop(); }
      timeline.freeze(true);
      setLoading(false);
      syncAssPlaybackClock(true);
    }

    function supersedeBufferingIncident(reason, target) {
      var currentTarget = Number(target);
      var result;
      if (!isFinite(currentTarget)) { currentTarget = timeline.position(); }
      clearBufferResumeTimer();
      if (playbackSession.buffering()) {
        result = bufferRecoveryResult({
          accepted: true,
          reason: reason || 'superseded',
          target: currentTarget,
          candidate: currentTarget,
          delta: 0,
          nativeTime: rawNativeTime(),
          offsetBase: currentOffsetBase()
        }, reason || 'superseded');
        playbackSession.finishBuffering(result);
      }
      if (bufferingIndicator) { bufferingIndicator.stop(); }
      playbackSession.beginClockDiscontinuity();
      timeline.freeze(true);
      setLoading(false);
    }

    var bufferingIndicator = PlayerBufferingIndicator.create({
      root: timerRoot,
      isEligible: function () { return active() && !!playback && !playbackSession.streamSwitching() && !playbackSession.nativeSeekPending() && videoDriver && !videoDriver.paused(); },
      position: function () { return Number(videoDriver && videoDriver.currentTime() || 0); },
      onShow: function () {
        debugPlayback('buffer-indicator-show');
        setLoading(true, true);
        notifyState();
      },
      onHide: function () {
        debugPlayback('buffer-indicator-hide');
        setLoading(false);
        notifyState();
      },
      onAdvance: function () {
        debugPlayback('buffer-indicator-advance');
        if (playbackSession.buffering() && !playbackSession.streamSwitching() && !playbackSession.terminalPlayback() && videoDriver && !videoDriver.paused()) {
          if (!resolveBufferResume()) { publishPlayingState(); }
        }
        notifyState();
      }
    });

    function acceptBufferResume(assessment, reason, initialReason) {
      var result = bufferRecoveryResult(assessment, reason, initialReason);
      debugPlayback('buffer-resume-accepted', { accepted: true, reason: result.reason, initialReason: result.initialReason || '', recoveryCandidate: result.candidate, recoveryTarget: result.target, recoveryDelta: result.delta });
      if (Number(result.delta) < -0.05 && subtitleRuntime && typeof subtitleRuntime.discontinuity === 'function') {
        subtitleRuntime.discontinuity(result.candidate, subtitleEditorState);
      }
      timeline.freeze(false);
      timeline.observe(result.offsetBase, result.nativeTime, true);
      stopBuffering(result, false);
      return result;
    }

    function settleBufferedSeek() {
      var assessment;
      if (!playback || playback.options.delivery === 'direct-play' || !reposition.pending()) { return false; }
      assessment = assessBufferResume();
      if (assessment.reason !== 'accepted' && assessment.reason !== 'backward-jump') { return false; }
      if (!settleDecoder(rawNativeTime())) { return false; }
      assessment.accepted = true;
      // settleDecoder already opened the matching ASS epoch. Do not reset it twice.
      stopBuffering(bufferRecoveryResult(assessment, 'seek-settlement'), false);
      return true;
    }

    function scheduleBufferResumeSettlement(initialReason) {
      var settlementGeneration;
      if (bufferResumeTimer !== null || !timerRoot.setTimeout) { return false; }
      bufferResumeGeneration += 1;
      settlementGeneration = bufferResumeGeneration;
      bufferResumeTimer = timerRoot.setTimeout(function () {
        var assessment;
        var checkpoint;
        var repairTarget;
        var result;
        bufferResumeTimer = null;
        if (!active() || !playback || playbackSession.terminalPlayback() || !playbackSession.buffering() || settlementGeneration !== bufferResumeGeneration) { return; }
        if (videoDriver.paused()) { return; }
        if (settleBufferedSeek()) { publishPlayingState(); return; }
        assessment = assessBufferResume();
        debugPlayback('buffer-settlement-sample', { accepted: assessment.accepted === true, reason: assessment.reason || '', recoveryCandidate: assessment.candidate, recoveryTarget: assessment.target, recoveryDelta: assessment.delta });
        if (assessment.accepted) {
          acceptBufferResume(assessment, 'transient-recovered', initialReason);
          publishPlayingState();
          return;
        }
        result = bufferRecoveryResult(assessment, assessment.reason, initialReason);
        playbackSession.recordBufferRecovery(result);
        checkpoint = playbackSession.bufferCheckpoint();
        if (playbackSession.consumeClockRepair()) {
          clockRepairCount += 1;
          repairTarget = checkpoint && checkpoint.absoluteTime !== null && checkpoint.absoluteTime !== undefined ? checkpoint.absoluteTime : timeline.position();
          repairTarget = Math.max(0, Math.min(durationSeconds(), Math.floor(Number(repairTarget) || 0)));
          if (subtitleRuntime && typeof subtitleRuntime.discontinuity === 'function') {
            debugPlayback('ass-discontinuity', { reason: 'buffer-repair', recoveryTarget: repairTarget });
            subtitleRuntime.discontinuity(repairTarget, subtitleEditorState);
          }
          debugPlayback('buffer-repair-rebuild', { reason: result.reason || '', recoveryTarget: repairTarget, recoveryCandidate: result.candidate, recoveryDelta: result.delta });
          recoveryRebuild(repairTarget, 'buffer-repair');
          return;
        }
        stopBuffering(result, true);
        recover.apply(null, [new Error('native playback clock remained inconsistent after buffering'), 'clock']);
      }, BUFFER_RESUME_SETTLEMENT_DELAY_MS);
      return true;
    }

    function resolveBufferResume() {
      var assessment;
      var result;
      if (!playbackSession.buffering()) { return false; }
      if (settleBufferedSeek()) { return false; }
      assessment = assessBufferResume();
      debugPlayback('buffer-resume-sample', { accepted: assessment.accepted === true, reason: assessment.reason || '', recoveryCandidate: assessment.candidate, recoveryTarget: assessment.target, recoveryDelta: assessment.delta });
      if (assessment.accepted) {
        acceptBufferResume(assessment, 'accepted');
        return false;
      }
      result = bufferRecoveryResult(assessment, assessment.reason);
      playbackSession.recordBufferRecovery(result);
      scheduleBufferResumeSettlement(result.reason);
      timeline.freeze(true);
      syncAssPlaybackClock(true);
      setLoading(true, true);
      return true;
    }

    function capabilitiesFor(current) {
      var source = call(values.capabilities) || {};
      var tracksRequireTranscode = false;
      var capabilities = {
        directPlay: source.directPlay,
        codecs: source.codecs,
        containers: source.containers,
        known: source.known,
        uhd: source.uhd,
        hdr10: source.hdr10,
        dolbyVision: source.dolbyVision,
        hdrKnown: source.hdrKnown,
        tracksRequireTranscode: false
      };
      var selectedAudio = String(current.options.audioStreamID || '');
      var defaultAudio = '';
      var selectedSubtitle = trackForId(current.subtitleTracks, current.options.subtitleStreamID);
      var subtitleClassification = SubtitleSync ? SubtitleSync.classify(selectedSubtitle) : { kind: 'unsupported' };
      var localSubtitleOverlay = !!(current.options.localSubtitleOverlay && selectedSubtitle && subtitleRuntime.isLocalKind(subtitleClassification));
      (current.audioTracks || []).forEach(function (track) { if (track.selected) { defaultAudio = String(track.id || ''); } });
      tracksRequireTranscode = (!!current.options.subtitleStreamID && !localSubtitleOverlay) || !!(selectedAudio && defaultAudio && selectedAudio !== defaultAudio);
      capabilities.tracksRequireTranscode = tracksRequireTranscode;
      return capabilities;
    }

    function selectedVersionFor(current) {
      var versions = current && current.mediaVersions || [];
      var mediaIndex = Number(current && current.options && current.options.mediaIndex || 0);
      var partIndex = Number(current && current.options && current.options.partIndex || 0);
      var index;
      for (index = 0; index < versions.length; index += 1) {
        if (Number(versions[index].mediaIndex || 0) === mediaIndex && Number(versions[index].partIndex || 0) === partIndex) {
          return versions[index];
        }
      }
      return versions[0] || null;
    }

    function compatibilityContext(current) {
      var version = selectedVersionFor(current) || {};
      var options = current && current.options || {};
      var audio = trackForId(version.audioTracks || current && current.audioTracks, options.audioStreamID);
      var subtitles = trackForId(version.subtitleTracks || current && current.subtitleTracks, options.subtitleStreamID);
      return {
        serverIdentity: call(values.compatibilityIdentity) || config.apiBaseUrl || 'server',
        mediaIdentity: current && current.ratingKey || '',
        fileIdentity: version.partKey || version.partId || version.fileName || current && current.partKey || '',
        mediaIndex: version.mediaIndex,
        partIndex: version.partIndex,
        audioStreamID: audio && audio.id || '',
        subtitleStreamID: subtitles && subtitles.id || '',
        audio: audio ? { codec: audio.codec, profile: audio.profile, channels: audio.channels, language: audio.language || audio.languageCode || audio.languageTag } : null,
        subtitles: subtitles ? { codec: subtitles.codec, format: subtitles.format, source: subtitles.source || (subtitles.external || subtitles.key ? 'external' : 'internal'), language: subtitles.language || subtitles.languageCode || subtitles.languageTag, forced: subtitles.forced === true || subtitles.forced === '1' } : null,
        enabled: call(values.compatibilityEnabled) !== false
      };
    }

    function selectRecovery(current, previous) {
      var prior = previous === undefined ? PlaybackRecovery.current(recovery) : previous;
      var sameFile = prior && (prior.kind === 'direct-play' || prior.kind === 'direct-stream') && prior.mediaIndex === current.options.mediaIndex && prior.partIndex === current.options.partIndex;
      var plan = PlaybackStrategy.plan(
        current.requestedPlaybackMode || current.options.playbackMode || 'auto',
        capabilitiesFor(current),
        current.mediaVersions || [],
        current.options.mediaIndex,
        current.requestedVideoQuality || current.options.videoQuality || 'original',
        sameFile ? null : compatibilityMemory,
        compatibilityContext(current)
      );
      var next = PlaybackRecovery.create(plan);
      var index;
      if (sameFile) {
        for (index = 0; index < plan.length; index += 1) {
          if (plan[index].kind === prior.kind) { next.index = index; return next; }
        }
        if (plan.length) {
          traceRecovery(current.requestedPlaybackMode === 'transcode' ? 'SELECT[transcode]' :
            'FALLBACK[selection:' + (capabilitiesFor(current).tracksRequireTranscode ? 'tracks' : 'device') + ']');
        }
      }
      return next;
    }

    function applyVersion(current, step) {
      var versions = current.mediaVersions || [];
      var version;
      var index;
      for (index = 0; index < versions.length; index += 1) {
        if (versions[index].mediaIndex === step.mediaIndex && versions[index].partIndex === step.partIndex) { version = versions[index]; break; }
      }
      if (!version) { return; }
      current.mediaIndex = version.mediaIndex;
      current.partIndex = version.partIndex;
      current.partId = version.partId;
      current.partKey = version.partKey;
      current.fileName = version.fileName;
      current.fileSize = version.fileSize;
      current.originalContainer = version.container;
      current.originalVideoCodec = version.videoCodec;
      current.videoDynamicRange = version.videoDynamicRange;
      current.sourceWidth = version.width;
      current.sourceHeight = version.height;
      current.mediaProfile = version.profile || current.mediaProfile;
      current.audioTracks = version.audioTracks || current.audioTracks;
      current.subtitleTracks = version.subtitleTracks || current.subtitleTracks;
    }

    function directOnlyViolation(current) {
      return !!current && current.requestedPlaybackMode === 'direct' && /^transcode-/.test(String(current.playbackMode || ''));
    }

    function compatibilityRequest(current, step) {
      var version = selectedVersionFor({
        mediaVersions: current && current.mediaVersions || [],
        options: { mediaIndex: step && step.mediaIndex, partIndex: step && step.partIndex }
      }) || {};
      var audio = trackForId(current && current.audioTracks, current && current.options && current.options.audioStreamID);
      var subtitles = trackForId(current && current.subtitleTracks, current && current.options && current.options.subtitleStreamID);
      var source = copyObject(version);
      if (audio) {
        source.audioCodec = audio.codec || source.audioCodec;
        source.audioProfile = audio.profile || source.audioProfile;
        source.audioChannels = audio.channels || source.audioChannels;
        source.audioLanguage = audio.language || source.audioLanguage;
        source.audioStreamID = audio.id || source.audioStreamID;
      }
      if (subtitles) {
        source.subtitleCodec = subtitles.codec || source.subtitleCodec;
        source.subtitleFormat = subtitles.format || source.subtitleFormat;
        source.subtitleSource = subtitles.source || (subtitles.external ? 'external' : 'internal');
        source.subtitleLanguage = subtitles.language || source.subtitleLanguage;
        source.subtitleStreamID = subtitles.id || source.subtitleStreamID;
      }
      var context = compatibilityContext(current);
      return {
        kind: step && step.kind,
        version: source,
        audio: context.audio,
        subtitles: context.subtitles,
        context: context
      };
    }

    function confirmedCompatibilityError(error, source) {
      return !!PlaybackRecovery.incompatibility(error, source);
    }

    function rememberCompatibilityFailure(error, source) {
      var step;
      if (!compatibilityMemory || typeof compatibilityMemory.recordFailure !== 'function' || compatibilityRecordedToken === compatibilityAttemptToken) { return; }
      step = PlaybackRecovery.current(recovery);
      if (!step || (step.kind !== 'direct-play' && step.kind !== 'direct-stream') || !confirmedCompatibilityError(error, source)) { return; }
      compatibilityRecordedToken = compatibilityAttemptToken;
      compatibilityMemory.recordFailure(compatibilityRequest(playback, step), { confirmed: true });
    }

    function rememberCompatibilitySuccess() {
      var step;
      if (!compatibilityMemory || typeof compatibilityMemory.recordSuccess !== 'function') { return; }
      step = PlaybackRecovery.current(recovery);
      if (!step || (step.kind !== 'direct-play' && step.kind !== 'direct-stream')) { return; }
      compatibilityMemory.recordSuccess(compatibilityRequest(playback, step));
    }

    function notifyDirectPlaybackFailure(error, source) {
      if (!playback || playback.requestedPlaybackMode !== 'direct' || typeof values.onDirectPlaybackFailure !== 'function') { return false; }
      if (directFailureNotifiedToken === compatibilityAttemptToken || !confirmedCompatibilityError(error, source)) { return false; }
      directFailureNotifiedToken = compatibilityAttemptToken;
      call(values.onDirectPlaybackFailure, error, retry, switchToAutomatic);
      return true;
    }

    function cancelLocalSubtitleRequest() {
      localSubtitleGeneration += 1;
      if (localSubtitleRequest && localSubtitleRequest.abort) { localSubtitleRequest.abort(); }
      localSubtitleRequest = null;
      localSubtitleLoading = false;
    }

    function subtitleRenderMode(current) {
      var localState;
      if (!current || !current.options || !current.options.subtitleStreamID) { return 'off'; }
      if (localSubtitleLoading) { return 'local-loading'; }
      localState = subtitleRuntime.localState();
      if (current.options.localSubtitleOverlay === true && localState) { return 'local'; }
      return 'remote';
    }

    function subtitleIdentity() {
      return call(values.subtitleIdentity) || config.apiBaseUrl || 'local';
    }

    function publicSubtitleEditorAvailability(streamId) {
      if (arguments.length) { return subtitleRuntime.editorAvailability(playback, streamId); }
      return subtitleRuntime.editorAvailability(playback);
    }

    function releaseSubtitleSeekGate() {
      var candidate;
      var target;
      var settled = false;
      if (!subtitleRuntime.seekPresentationPending() || subtitleRuntime.seekPresentationWaitingForPlaying() || playbackSession.nativeSeekPending() || playbackSession.streamSwitching()) { return false; }
      if (playbackSession.buffering() || Number(videoDriver && videoDriver.readyState()) < 3) {
        subtitleRuntime.markSeekRebuffer();
        return false;
      }
      target = subtitleRuntime.seekPresentationTarget();
      candidate = currentOffsetBase() + Number(videoDriver && videoDriver.currentTime());
      if (reposition.pending()) {
        if (!isFinite(candidate) || target === null) { return false; }
        if (candidate < target - 0.05) {
          settled = settleDecoder(videoDriver.currentTime());
          if (!settled) { return false; }
        } else if (candidate <= target + 0.05) { return false; }
      }
      subtitleRuntime.releaseSeekPresentation();
      return true;
    }

    function renderSubtitleOverlay() {
      if (subtitleRuntime.seekPresentationPending()) {
        if (subtitleRuntime && typeof subtitleRuntime.hide === 'function') { subtitleRuntime.hide(); }
        return;
      }
      subtitleRuntime.render(subtitleEditorState, subtitleRenderTime(), playbackSession.buffering() || !!(videoDriver && videoDriver.paused()));
    }

    function syncAssPlaybackClock(pausedOverride) {
      var isPaused;
      var subtitleTime;
      var publicTimeValue;
      var nativeTime;
      if (!playback || !subtitleRuntime || typeof subtitleRuntime.syncAssClock !== 'function') { return; }
      isPaused = pausedOverride === true || (pausedOverride !== false && !!(videoDriver && videoDriver.paused()));
      subtitleTime = subtitleRenderTime();
      publicTimeValue = absoluteTime();
      nativeTime = Number(videoDriver && videoDriver.currentTime());
      if (assColdStartMetrics && typeof assColdStartMetrics.recordAssSync === 'function') {
        assColdStartMetrics.recordAssSync('controller', {
          nativeTime: isFinite(nativeTime) ? nativeTime : publicTimeValue,
          publicTime: publicTimeValue,
          subtitleTime: subtitleTime,
          nativeTrusted: isFinite(nativeTime) && Math.abs(nativeTime - subtitleTime) <= 0.001,
          paused: isPaused
        });
      }
      subtitleRuntime.syncAssClock(subtitleTime, isPaused, subtitleEditorState);
    }

    function fallbackAssPreview(stateValue, track) {
      var classification = SubtitleSync ? SubtitleSync.classify(track) : { kind: 'unsupported' };
      var needsOffsetPreview;
      if (!stateValue || !track || !subtitleRuntime.isAssKind(classification)) { return false; }
      subtitleRuntime.markFailed(track.id);
      stopSubtitlePreviewClock();
      subtitleRuntime.disposeAss();
      rememberPreviewOffset(stateValue, track);
      needsOffsetPreview = Math.round(Number(stateValue.offsetMs || 0)) !== Math.round(Number(track.offset || 0));
      playback.options.subtitleStreamID = String(track.id || '');
      playback.options.localSubtitleOverlay = false;
      SubtitleEditorSession.update(stateValue, {
        previewMode: 'server',
        previewError: false,
        previewLoading: false,
        rendererType: null,
        status: ''
      });
      renderSubtitleOverlay();
      call(values.onSubtitleEditorState, subtitleEditorSnapshot());
      if (!playbackSession.destroyed() && subtitleEditorState === stateValue) {
        if (needsOffsetPreview) { queueExternalOffset(stateValue, track); }
        else { rebuild(subtitleEditorPreviewPosition(stateValue), true); }
      }
      return true;
    }

    function handleAssRuntimeError(rendererError) {
      var localState;
      var track;
      var position;
      var errorLabel;
      if (!subtitleRuntime || !playback || playbackSession.destroyed()) { return; }
      if (subtitleEditorState && subtitleEditorState.open) {
        if (subtitleEditorState.previewMode !== 'ass') { return; }
        track = trackForId(playback.subtitleTracks, subtitleEditorState.selectedStreamID);
        if (!track) { return; }
        if (fallbackAssPreview(subtitleEditorState, track)) { return; }
        subtitleRuntime.markFailed(track.id);
        stopSubtitlePreviewClock();
        subtitleRuntime.disposeAss();
        playback.options.localSubtitleOverlay = false;
        SubtitleEditorSession.update(subtitleEditorState, {
          previewError: true,
          previewLoading: false,
          rendererType: null,
          status: translate('player.subtitlePreviewFailed')
        });
        renderSubtitleOverlay();
        call(values.onError, rendererError || new Error('ASS subtitle renderer unavailable'));
        call(values.onSubtitleEditorState, subtitleEditorSnapshot());
        return;
      }
      localState = subtitleRuntime.localState();
      if (!localState || localState.rendererType !== 'ass') { return; }
      track = trackForId(playback.subtitleTracks, localState.streamId);
      if (!track || String(playback.options.subtitleStreamID || '') !== String(track.id || '')) { return; }
      errorLabel = String(rendererError && rendererError.message || rendererError || 'unknown').replace(/\s+/g, ' ').replace(/\]/g, ')').slice(0, 64);
      traceRecovery('ASSERR[' + errorLabel + ']');
      subtitleRuntime.markFailed(track.id);
      subtitleRuntime.disposeAss();
      subtitleRuntime.clearLocal();
      playback.options.localSubtitleOverlay = false;
      call(values.onError, rendererError || new Error('ASS subtitle renderer unavailable'));
      position = absoluteTime();
      recovery = selectRecovery(playback);
      recovery.position = position;
      applyAttempt(false);
    }

    function subtitleRenderTime() {
      var publicTimeValue = absoluteTime();
      var nativeTime;
      if (playback && playback.options && playback.options.delivery === 'direct-play' &&
          !playbackSession.streamSwitching() && !playbackSession.buffering() && !playbackSession.nativeSeekPending() && videoDriver) {
        nativeTime = Number(videoDriver.currentTime());
        if (isFinite(nativeTime) && Math.abs(nativeTime - publicTimeValue) <= SUBTITLE_NATIVE_CLOCK_TOLERANCE_SECONDS) {
          return Math.max(0, nativeTime);
        }
      }
      return publicTimeValue;
    }

    function stopSubtitlePreviewClock() {
      if (subtitlePreviewTimer !== null && timerRoot.clearInterval) { timerRoot.clearInterval(subtitlePreviewTimer); }
      subtitlePreviewTimer = null;
    }

    function startSubtitlePreviewClock() {
      stopSubtitlePreviewClock();
      if (timerRoot.setInterval) {
        subtitlePreviewTimer = timerRoot.setInterval(function () {
          releaseSubtitleSeekGate();
          renderSubtitleOverlay();
        }, 50);
      }
    }

    function loadAssSubtitleText(current, track, callback) {
      var owner = AssSubtitlePrefetch;
      var identity = call(values.assSubtitlePrefetchIdentity, current, track);
      var completed = false;
      var directStarted = false;
      var ownerStarted = false;
      var request = null;

      function finish(error, text) {
        if (completed) { return; }
        completed = true;
        call(callback, error || null, text === undefined || text === null ? '' : text);
      }

      function direct() {
        if (directStarted || completed) { return request; }
        directStarted = true;
        try {
          request = PlexClient.loadSubtitleText(config, current, track, function (error, text) {
            finish(error || null, text);
          });
        } catch (error) {
          finish(error);
        }
        return request;
      }

      function ownerLoad() {
        var result;
        if (ownerStarted || completed) { return request; }
        ownerStarted = true;
        try {
          result = owner.request({ identity: String(identity || ''), playback: current, track: track },
            { priority: 'foreground' }, function (error, text) {
              if (completed) { return; }
              if (error || !text) { direct(); return; }
              finish(null, text);
            });
        } catch (error) {
          ownerStarted = false;
          direct();
          return request;
        }
        if (result === false && !completed) {
          ownerStarted = false;
          direct();
        }
        return result;
      }

      function claimComplete(error, text) {
        if (completed) { return; }
        if (error) { direct(); return; }
        if (!text) { ownerLoad(); return; }
        finish(null, text);
      }

      if (!owner || typeof owner.claim !== 'function' || typeof owner.request !== 'function' || !identity) {
        return direct();
      }
      try {
        request = owner.claim(String(identity), claimComplete);
      } catch (error) {
        return direct();
      }
      if (request && request.content) {
        finish(null, request.content);
      } else if (request === null && !ownerStarted && !directStarted && !completed) {
        request = ownerLoad();
      }
      return request;
    }

    function configureLocalSubtitles(current, callback, preserveAss) {
      var track = trackForId(current.subtitleTracks, current.options.subtitleStreamID);
      var classification = SubtitleSync ? SubtitleSync.classify(track) : { kind: 'unsupported' };
      var offset = subtitleRuntime.offset(current, track);
      var requestedMode = current.requestedPlaybackMode || current.options.playbackMode || 'auto';
      var localEnabled = subtitleRuntime.renderingEnabled(classification);
      var requestGeneration;
      cancelLocalSubtitleRequest();
      if (!preserveAss || !track || !subtitleRuntime.isAssKind(classification) || !localEnabled || requestedMode === 'transcode' || subtitleRuntime.failed(track.id)) { subtitleRuntime.disposeAss(); }
      subtitleRuntime.clearLocal();
      current.options.localSubtitleOverlay = false;
      if (!track || !subtitleRuntime.isLocalKind(classification) || !localEnabled ||
          (classification.kind === 'external-text' && requestedMode === 'transcode') ||
          (subtitleRuntime.isAssKind(classification) && requestedMode === 'transcode') ||
          (classification.kind === 'embedded-text' && offset === 0) || subtitleRuntime.failed(track.id)) {
        call(callback);
        return;
      }
      localSubtitleLoading = true;
      notifyState();
      requestGeneration = localSubtitleGeneration;
      var requestCompleted = false;
      var requestLoader = classification.kind === 'external-ass' || classification.kind === 'embedded-ass' ?
        loadAssSubtitleText : function (source, subtitleTrack, complete) {
          return PlexClient.loadSubtitleText(config, source, subtitleTrack, complete);
        };
      var request = requestLoader(current, track, function (error, text) {
        var cues;
        requestCompleted = true;
        if (requestGeneration !== localSubtitleGeneration || current !== playback || playbackSession.destroyed()) { return; }
        localSubtitleRequest = null;
        cues = error || !SubtitleSync ? [] : SubtitleSync.parse(text);
        if (error || (classification.kind !== 'external-ass' && classification.kind !== 'embedded-ass' && !cues.length)) {
          localSubtitleLoading = false;
          subtitleRuntime.markFailed(track.id);
          current.options.localSubtitleOverlay = false;
          if (classification.kind !== 'external-text' && classification.kind !== 'external-ass') { call(values.onError, error || new Error('subtitle preview unavailable')); }
          call(callback);
        } else if (classification.kind === 'external-ass' || classification.kind === 'embedded-ass') {
          subtitleRuntime.loadAss(track, text, function (rendererError) {
            if (requestGeneration !== localSubtitleGeneration || current !== playback || playbackSession.destroyed()) { return; }
            localSubtitleLoading = false;
            if (rendererError) {
              subtitleRuntime.markFailed(track.id);
              current.options.localSubtitleOverlay = false;
              call(values.onError, rendererError);
            } else {
              current.options.localSubtitleOverlay = true;
              subtitleRuntime.setLocal({ rendererType: 'ass', content: text, cues: null, offsetMs: offset, streamId: track.id, size: current.options.subtitleSize || 100 });
              if (classification.kind === 'external-ass' && typeof subtitleRuntime.syncAssClock === 'function') {
                subtitleRuntime.syncAssClock(subtitleRenderTime(), !!(videoDriver && videoDriver.paused()));
              }
            }
            notifyState();
            call(callback);
          });
        } else {
          localSubtitleLoading = false;
          current.options.localSubtitleOverlay = true;
          subtitleRuntime.setLocal({ cues: cues, offsetMs: offset, streamId: track.id, size: current.options.subtitleSize || 100 });
          notifyState();
          call(callback);
        }
      });
      if (!requestCompleted) { localSubtitleRequest = request; }
    }

    function beginSourceSwitch(target, phase) {
      var resetLocalClock = playbackSession.nativeSourceAssigned() || subtitleRuntime.seekPresentationPending();
      stopBuffering();
      playbackSession.beginStreamSwitch(phase);
      playbackSession.finishBuffering();
      anchorClock(target, true);
      if (resetLocalClock && playback.options.delivery !== 'direct-play') {
        // Rebuild may normalize a fractional target. Reset ASS against the actual
        // new absolute origin, not the preceding source or optimistic seek target.
        subtitleRuntime.beginSeekPresentation(true, target);
        subtitleRuntime.discontinuity(target, subtitleEditorState);
        syncAssPlaybackClock(true);
      }
    }

    function applyAttempt(preserveFrame) {
      var step = PlaybackRecovery.current(recovery);
      var position = Math.max(0, Number(recovery.position || 0));
      var streamOffset;
      var current = playback;
      var attemptGeneration = generation;
      var attemptSession;
      var prepareRequest;
      var prepareCompleted = false;
      if (!current || !step || !active()) { call(values.showError, false, retry); return; }
      if (recoveryTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(recoveryTimer); }
      recoveryTimer = null;
      compatibilityAttemptToken += 1;
      playbackSession.markTerminalPlayback(false);
      recovery = PlaybackRecovery.start(recovery, position);
      applyVersion(current, step);
      current.options.delivery = step.kind === 'direct-play' ? 'direct-play' : step.kind;
      traceDelivery(current.options.delivery);
      current.options.mediaIndex = step.mediaIndex;
      current.options.partIndex = step.partIndex;
      current.options.videoQuality = step.videoQuality;
      current.options.videoResolution = step.videoResolution;
      current.options.safeTranscode = step.safeTranscode === true;
      current.options.playbackMode = step.kind === 'transcode' || step.kind === 'safe-transcode' ? 'transcode' : 'auto';
      streamOffset = step.kind === 'direct-play' ? 0 : position;
      if (usesOffsetStream(step) && isTerminalDirectWindow(position)) { streamOffset = terminalStreamStart(position); }
      current.options.offset = streamOffset;
      if (subtitleEditorState && subtitleEditorState.playbackRef === current) {
        var o = subtitleEditorState.originalOptions;
        var n = current.options;
        o.delivery = n.delivery;
        o.offset = n.offset;
        o.playbackMode = n.playbackMode;
        o.safeTranscode = n.safeTranscode;
      }
      current.directSeekTarget = step.kind === 'direct-play' ? position : null;
      current.terminalSeekTarget = usesOffsetStream(step) && isTerminalDirectWindow(position) ? position : null;
      current.terminalNativeSeekTarget = current.terminalSeekTarget === null ? null : terminalNativeTarget(position, streamOffset);
      timeline.stopKeepalive();
      PlexClient.rotateTranscodeSession(current);
      attemptSession = current.transcodeSession;
      beginSourceSwitch(position, recovery.index > 0 ? 'recovering' : 'starting');
      current.offsetBase = streamOffset;
      call(values.hideError);
      setStatus('preparing');
      setLoading(true, !!preserveFrame);
      cancelPlaybackPrepareRequest();
      debugPlayback('source-prepare-start', { action: 'attempt', recoveryTarget: position, offsetBase: streamOffset });
      prepareRequest = PlexClient.preparePlayback(config, current, current.options, function (error, sourceUrl) {
        prepareCompleted = true;
        if (playbackPrepareRequest === prepareRequest) { playbackPrepareRequest = null; }
        if (!active() || playback !== current || attemptGeneration !== generation || current.transcodeSession !== attemptSession) { return; }
        if (error || !sourceUrl || directOnlyViolation(current)) {
          recover.apply(null, [error || (directOnlyViolation(current) ? new Error('unsupported direct playback') : new Error('playback source unavailable')), 'prepare']);
          return;
        }
        current.sourceUrl = sourceUrl;
        current.hlsUrl = sourceUrl;
        startKeepalive();
        renderPlaybackInfo();
        videoDriver.setAutoplay(false);
        videoDriver.pause();
        videoDriver.setSource(sourceUrl);
        playbackSession.markSourceAssigned();
        debugSourceGeneration += 1;
        debugPlayback('source-applied', { action: 'attempt', offsetBase: currentOffsetBase() });
        videoDriver.load();
        notifyState();
      });
      if (!prepareCompleted && active() && playback === current && attemptGeneration === generation && current.transcodeSession === attemptSession) {
        playbackPrepareRequest = prepareRequest || null;
      } else if (!prepareCompleted && prepareRequest && prepareRequest.abort) {
        prepareRequest.abort();
      }
    }

    function recover(error) {
      var source = arguments.length > 1 ? arguments[1] : 'native';
      var position = !playback ? 0 : (playbackSession.streamSwitching() ? Number(recovery.position || 0) : absoluteTime());
      var offline = call(values.isOffline) === true || timerRoot.navigator && timerRoot.navigator.onLine === false;
      var previousStep;
      var nextStep;
      if (recoveryTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(recoveryTimer); }
      recoveryTimer = null;
      if (error) { call(values.onError, error); }
      rememberCompatibilityFailure(error, source);
      if (!playback || !recovery.plan.length) {
        playbackSession.finishStreamSwitch();
        if (notifyDirectPlaybackFailure(error, source)) { notifyState(); return; }
        call(values.showError, false, retry);
        notifyState();
        return;
      }
      previousStep = PlaybackRecovery.current(recovery);
      recovery = PlaybackRecovery.fallback(recovery, offline, position, error, source);
      nextStep = PlaybackRecovery.current(recovery);
      if (previousStep && nextStep && previousStep !== nextStep) {
        traceRecovery('FALLBACK[recover:' + source + ':' + (PlaybackRecovery.incompatibility(error, source) || 'transcode-failure') + ']');
        debugPlayback('recovery-fallback', { reason: String(source || 'native'), action: String(nextStep.kind || '') });
      }
      if (recovery.status === 'waiting-network') {
        playbackSession.finishStreamSwitch();
        call(values.showError, true, retry);
        notifyState();
        return;
      }
      if (recovery.status === 'failed') {
        playbackSession.finishStreamSwitch();
        if (notifyDirectPlaybackFailure(error, source)) { notifyState(); return; }
        call(values.showError, false, retry);
        notifyState();
        return;
      }
      if (timerRoot.setTimeout) { recoveryTimer = timerRoot.setTimeout(function () { recoveryTimer = null; applyAttempt(true); }, 350); }
    }

    function retry() {
      call(values.hideError);
      if (!playback) { return false; }
      recovery = PlaybackRecovery.retry(recovery);
      applyAttempt(true);
      return true;
    }

    function switchToAutomatic(callback) {
      var current = playback;
      var position;
      if (!current || !active()) { call(callback, new Error('playback unavailable')); return false; }
      position = absoluteTime();
      current.requestedPlaybackMode = 'auto';
      current.options.playbackMode = 'auto';
      recovery = selectRecovery(current);
      recovery.position = position;
      applyAttempt(true);
      call(values.onSettingsApplied, current, snapshot());
      call(callback, null, snapshot());
      return true;
    }

    function resumeRebuiltStream() {
      var current = playback;
      var sourceSession = current && current.transcodeSession;
      var sourceGeneration = generation;
      function valid() {
        return active() && playback === current && current && current.transcodeSession === sourceSession &&
          generation === sourceGeneration && playbackSession.nativeSourceAssigned() && playbackSession.nativeSourceReady();
      }
      debugPlayback('resume-rebuilt-scheduled');
      if (resumeTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(resumeTimer); }
      if (!timerRoot.setTimeout) { return; }
      resumeTimer = timerRoot.setTimeout(function () {
        debugPlayback('resume-rebuilt-fire');
        if (!valid() || !videoDriver || videoDriver.readyState() < 2 || pendingSeek !== null) { return; }
        if (playbackSession.nativeSeekPending()) {
          resumeRebuiltStream();
          return;
        }
        if (playback && playback.terminalEndPause) {
          finishTerminalPause();
          return;
        }
        if (pendingRestore && pendingRestore.paused) {
          playbackSession.finishStreamSwitch();
          playbackSession.finishBuffering();
          timeline.freeze(false);
          videoDriver.pause();
          setLoading(false);
          setStatus('paused');
          pendingRestore = null;
          timeline.setSuppressed(false);
          startReporting();
          renderProgress(absoluteTime(), playback && Number(playback.duration || 0) / 1000);
          notifyState();
          return;
        }
        playbackSession.finishStreamSwitch();
        requestNativePlay();
        resumeTimer = timerRoot.setTimeout(function () {
          if (valid() && pendingSeek === null && !playbackSession.nativeSeekPending() && videoDriver.paused() && videoDriver.readyState() >= 2 && playbackSession.nativePlayPending()) {
            playbackSession.finishNativePlay();
            requestNativePlay();
          }
        }, 250);
      }, 120);
    }

    function rebuild(absolute, updateSelection) {
      var current = playback;
      var target;
      var recoveryStep;
      var reason = rebuildReason || (updateSelection === true ? 'selection' : 'rebuild');
      var streamOffset;
      var transcodeSession;
      var rebuildGeneration = generation;
      var prepareRequest;
      var prepareCompleted = false;
      function bad() {
        return !active() || playback !== current || current.transcodeSession !== transcodeSession || rebuildGeneration !== generation;
      }
      function failPrepare(error, status) {
        playbackSession.finishStreamSwitch();
        timeline.freeze(false);
        setLoading(false);
        setStatus(status || 'stream-error');
        if (error) { call(values.onError, error); }
        if (pendingRestore) {
          pendingRestore = null;
          timeline.setSuppressed(false);
          startReporting();
        }
      }
      function applySource(sourceUrl) {
        if (bad()) { return; }
        try {
          current.sourceUrl = sourceUrl;
          current.hlsUrl = sourceUrl;
          startKeepalive();
          renderPlaybackInfo();
          videoDriver.setAutoplay(false);
          videoDriver.pause();
          current.offsetBase = streamOffset;
          videoDriver.setSource(sourceUrl);
          playbackSession.markSourceAssigned();
          debugSourceGeneration += 1;
          debugPlayback('source-applied', { action: 'rebuild', offsetBase: currentOffsetBase(), recoveryTarget: target });
          videoDriver.load();
          notifyState();
        } catch (error) { failPrepare(error, 'stream-error'); }
      }
      function prepareSource() {
        cancelPlaybackPrepareRequest();
        debugPlayback('source-prepare-start', { action: 'rebuild', recoveryTarget: target, offsetBase: streamOffset });
        prepareRequest = PlexClient.preparePlayback(config, current, current.options, function (error, sourceUrl) {
          prepareCompleted = true;
          if (playbackPrepareRequest === prepareRequest) { playbackPrepareRequest = null; }
          if (bad()) { return; }
          if (error || !sourceUrl) { failPrepare(error, 'stream-error'); recover.apply(null, [error, 'rebuild']); return; }
          applySource(sourceUrl);
        });
        if (!prepareCompleted && active() && playback === current && current.transcodeSession === transcodeSession && rebuildGeneration === generation) {
          playbackPrepareRequest = prepareRequest || null;
        } else if (!prepareCompleted && prepareRequest && prepareRequest.abort) {
          prepareRequest.abort();
        }
      }
      if (!current) { return false; }
      target = Math.max(0, Math.min(Number(current.duration || 0) / 1000, Math.floor(Number(absolute || 0))));
      debugPlayback('rebuild-start', { recoveryTarget: target, action: updateSelection === true ? 'selection' : 'source', reason: reason });
      recoveryStep = PlaybackRecovery.current(recovery);
      if (recoveryStep && recoveryStep.kind !== current.options.delivery) {
        recovery = PlaybackRecovery.rebuild(recovery, target);
        applyAttempt(false);
        return true;
      }
      if (arguments.length < 2 && recoveryStep && recoveryStep.kind === 'direct-play' && !isTerminalDirectWindow(target) && !(pendingRestore && pendingRestore.reopen)) {
        traceRecovery('REOPEN[' + reason + ']');
        return reopenSeek(target, reason);
      }
      if (recoveryStep && recoveryStep.kind === 'direct-play') {
        traceRecovery('RETRY[' + reason + ']');
        recovery = PlaybackRecovery.rebuild(recovery, target);
        applyAttempt(false);
        return true;
      }
      recovery = PlaybackRecovery.rebuild(recovery, target);
      recoveryStep = PlaybackRecovery.current(recovery);
      playbackSession.markTerminalPlayback(false);
      streamOffset = usesOffsetStream(recoveryStep) && isTerminalDirectWindow(target) ? terminalStreamStart(target) : target;
      current.options.offset = streamOffset;
      current.directSeekTarget = null;
      current.terminalSeekTarget = usesOffsetStream(recoveryStep) && isTerminalDirectWindow(target) ? target : null;
      current.terminalNativeSeekTarget = current.terminalSeekTarget === null ? null : terminalNativeTarget(target, streamOffset);
      pendingSeek = null;
      if (seekTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(seekTimer); }
      seekTimer = null;
      report('stopped');
      beginSourceSwitch(target, 'recovering');
      timeline.stopKeepalive();
      PlexClient.rotateTranscodeSession(current);
      transcodeSession = current.transcodeSession;
      setStatus('preparing');
      setLoading(true, false);
      if (!updateSelection) { prepareSource(); return true; }
      PlexClient.setStreamSelection(config, current, current.options, function (selectionError) {
        if (bad()) { return; }
        if (selectionError) { failPrepare(selectionError, 'track-error'); return; }
        prepareSource();
      });
      return true;
    }

    function reopenSeek(target, reason) {
      var current = playback;
      var options;
      if (!current) { return false; }
      options = current.options;
      options.playbackMode = current.requestedPlaybackMode || options.playbackMode;
      options.videoQuality = current.requestedVideoQuality || options.videoQuality;
      options.audioTrackPreference = trackForId(current.audioTracks, options.audioStreamID);
      options.subtitleTrackPreference = trackForId(current.subtitleTracks, options.subtitleStreamID);
      options.subtitleMode = options.subtitleTrackPreference ? 'always' : 'off';
      return open({ detail: current, startOffset: target, preferences: options, internalReopen: true, preservePaused: pendingRestore ? pendingRestore.paused : videoDriver.paused(), reopenReason: String(reason || 'seek') });
    }

    function commitSeek(options) {
      var decision;
      var target;
      var terminalPause = playbackSession.pendingTerminalPause();
      var forceRebuild = options && options.forceRebuild;
      if (pendingSeek === null || !playback || !active()) { return; }
      playbackSession.setPendingTerminalPause(false);
      playback.terminalEndPause = terminalPause;
      target = pendingSeek;
      pendingSeek = null;
      seekTimer = null;
      supersedeBufferingIncident('explicit-seek', target);
      if (playbackSession.streamSwitching()) {
        subtitleRuntime.beginSeekPresentation(true, target);
        if (subtitleRuntime && typeof subtitleRuntime.discontinuity === 'function') {
          subtitleRuntime.discontinuity(target, subtitleEditorState);
        }
        recoveryRebuild(target, 'seek-switch');
        return;
      }
      forceRebuild = forceRebuild === true || terminalPause || (playback.options.delivery !== 'direct-play' && isTerminalDirectWindow(target));
      decision = reposition.decide({
        target: target,
        duration: Number(playback.duration || 0) / 1000,
        nativeDuration: videoDriver.duration(),
        offset: Number(playback.offsetBase || 0),
        buffered: ranges(videoDriver.buffered()),
        seekable: ranges(videoDriver.seekable()),
        directPlay: playback.options.delivery === 'direct-play',
        forceRebuild: forceRebuild
      });
      if (!decision) { return; }
      subtitleRuntime.beginSeekPresentation(decision.operation === 'rebuild' || !!(pendingRestore && pendingRestore.paused), decision.target);
      debugPlayback('seek-commit', { seekTarget: decision.target, nativeSeekTarget: decision.nativeTime, operation: decision.operation || '' });
      if (subtitleRuntime && typeof subtitleRuntime.discontinuity === 'function') {
        debugPlayback('ass-discontinuity', { reason: 'seek', seekTarget: decision.target });
        subtitleRuntime.discontinuity(decision.target, subtitleEditorState);
      }
      if (decision.operation === 'rebuild') {
        subtitleRuntime.markSeekRebuffer();
        if (playback.options.delivery === 'direct-stream' && !terminalPause) {
          traceRecovery('REOPEN[seek]');
          reopenSeek(decision.target, 'seek');
        }
        else { recoveryRebuild(decision.target, 'seek'); }
        return;
      }
      anchorClock(decision.target, false);
      armNativeSeekVerification(decision.target, decision.nativeTime);
      try { videoDriver.seek(decision.nativeTime); }
      catch (error) {
        playbackSession.finishNativeSeek();
        if (nativeSeekVerificationTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(nativeSeekVerificationTimer); }
        nativeSeekVerificationTimer = null;
        recoveryRebuild(decision.target, 'seek-error');
        return;
      }
      renderProgress(displayTime(), Number(playback.duration || 0) / 1000);
      updateEstimatedEnd();
      report(videoDriver.paused() ? 'paused' : 'playing');
      notifyState();
    }

    function seekAbsolute(seconds, options) {
      var duration;
      var requested;
      var target;
      options = options || {};
      if (!playback || !isFinite(Number(seconds))) { return false; }
      duration = Number(playback.duration || 0) / 1000;
      if (!isFinite(duration) || duration <= 0) { return false; }
      requested = Math.max(0, Math.min(duration, Number(seconds)));
      if (!pendingRestore) {
        pendingRestore = {
          paused: playbackSession.nativePlayPending() || (playbackSession.streamSwitching() && playbackSession.lifecycle() === 'starting' && !playbackSession.nativeSourceReady()) ? false : videoDriver.paused()
        };
      }
      debugPlayback('seek-request', { seekTarget: requested, source: String(options.source || 'user') });
      playbackSession.markTerminalPlayback(false);
      playbackSession.setPendingTerminalPause(isTerminalPauseTarget(requested));
      target = playbackSession.pendingTerminalPause() ? duration : requested;
      pendingSeek = target;
      if (seekTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(seekTimer); }
      if (options.immediate || !timerRoot.setTimeout) { commitSeek(options); }
      else { seekTimer = timerRoot.setTimeout(function () { commitSeek(options); }, 250); }
      renderProgress(displayTime(), duration);
      updateEstimatedEnd();
      return true;
    }

    function toggle() {
      if (!videoDriver || !playback) { return false; }
      if (videoDriver.paused()) {
        if (playbackSession.nativePlayPending()) {
          playbackSession.finishNativePlay();
          videoDriver.pause();
        } else {
          requestNativePlay();
        }
      } else {
        playbackSession.finishNativePlay();
        videoDriver.pause();
      }
      return true;
    }

    function applyPendingSettings(callback) {
      var current = playback;
      var position;
      if (!current) { call(callback, new Error('playback unavailable')); return false; }
      position = absoluteTime();
      PlexClient.setStreamSelection(config, current, current.options, function (error) {
        if (error || playback !== current) { call(callback, error || new Error('playback changed')); return; }
        configureLocalSubtitles(current, function () {
          if (playback !== current) { call(callback, new Error('playback changed')); return; }
          recovery = selectRecovery(current);
          recovery.position = position;
          applyAttempt(false);
          call(values.onSettingsApplied, current, snapshot());
          call(callback, null, snapshot());
        });
      });
      return true;
    }

    function changeTrack(kind, stream, callback) {
      var current = playback;
      var position;
      var descriptor = typeof stream === 'object' && stream ? stream : { id: stream };
      var id;
      if (!current || (kind !== 'audio' && kind !== 'subtitles')) { call(callback, new Error('track unavailable')); return false; }
      position = absoluteTime();
      id = String(descriptor.id || '');
      if (kind === 'audio') { current.options.audioStreamID = id; }
      else { current.options.subtitleStreamID = id; }
      call(values.onTrackChanged, kind, id, current);
      if (descriptor.apply === false) { call(callback, null, snapshot()); return true; }
      PlexClient.setStreamSelection(config, current, current.options, function (error) {
        if (error || playback !== current) { call(callback, error || new Error('playback changed')); return; }
        configureLocalSubtitles(current, function () {
          if (playback !== current) { call(callback, new Error('playback changed')); return; }
          recovery = selectRecovery(current);
          recovery.position = position;
          rebuild(position, false);
          call(callback, null, snapshot());
        });
      });
      return true;
    }

    function changeVersion(version, callback) {
      var current = playback;
      var position;
      var resolved;
      if (!current || !version) { call(callback, new Error('version unavailable')); return false; }
      if (version.kind === 'apply-settings') { return applyPendingSettings(callback); }
      if (version.kind === 'settings') {
        if (version.subtitleSize !== undefined) {
          current.options.subtitleSize = Number(version.subtitleSize);
          if (current.options.localSubtitleOverlay && subtitleRuntime.localState()) {
            subtitleRuntime.setLocalSize(current.options.subtitleSize);
            renderSubtitleOverlay();
          }
        }
        if (version.videoQuality !== undefined) { current.requestedVideoQuality = String(version.videoQuality); }
        if (version.playbackMode !== undefined) { current.requestedPlaybackMode = String(version.playbackMode); }
        call(callback, null, snapshot());
        return true;
      }
      position = absoluteTime();
      applyVersion(current, version);
      current.options.mediaIndex = version.mediaIndex;
      current.options.partIndex = version.partIndex;
      resolved = call(values.resolveVersionTracks, current, version) || {};
      if (resolved.audioStreamID !== undefined) { current.options.audioStreamID = String(resolved.audioStreamID || ''); }
      if (resolved.subtitleStreamID !== undefined) { current.options.subtitleStreamID = String(resolved.subtitleStreamID || ''); }
      call(values.onVersionChanged, version, current);
      if (version.apply === false) { call(callback, null, snapshot()); return true; }
      PlexClient.setStreamSelection(config, current, current.options, function (error) {
        if (error || playback !== current) { call(callback, error || new Error('playback changed')); return; }
        recovery = selectRecovery(current);
        recovery.position = position;
        applyAttempt(false);
        call(callback, null, snapshot());
      });
      return true;
    }

    function translate(key) {
      return call(values.translate, key) || key;
    }

    function resetSubtitlePreviewWrites(stateValue) {
      if (!stateValue) { return; }
      if (stateValue.previewDebounceTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(stateValue.previewDebounceTimer); }
      if (stateValue.previewSizeTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(stateValue.previewSizeTimer); }
      stateValue.previewDebounceTimer = null;
      stateValue.previewSizeTimer = null;
      stateValue.previewWriteInFlight = false;
      stateValue.previewPendingOffset = null;
      stateValue.previewServerOffsets = {};
      stateValue.previewOriginalOffsets = {};
      stateValue.previewIdleCallbacks = [];
    }

    function subtitleEditorCapabilities(stateValue) {
      var state = stateValue || subtitleEditorState;
      var track = trackForId(playback && playback.subtitleTracks, state && state.selectedStreamID);
      var local = !!(state && state.previewLoading !== true && state.previewError !== true &&
        (state.previewMode === 'overlay' || (state.previewMode === 'ass' && state.rendererType === 'ass')));
      if (!SubtitleSync || typeof SubtitleSync.editorCapabilities !== 'function') { return {}; }
      return SubtitleSync.editorCapabilities(track, {
        local: local,
        tracks: playback && playback.subtitleTracks || []
      });
    }

    function subtitleEditorActionAllowed(action, _options) {
      var capabilities = subtitleEditorCapabilities(subtitleEditorState);
      if (action === 'set-track') { return capabilities.track !== false; }
      if (action === 'set-size') { return capabilities.size === true; }
      if (action === 'adjust-offset') { return capabilities.offset === true; }
      if (action === 'seek') { return capabilities.timeline === true; }
      if (action === 'toggle-loop') { return capabilities.loop === true; }
      if (action === 'set-rendering') {
        return capabilities.renderSrt === true || capabilities.renderAss === true;
      }
      return true;
    }

    function subtitleEditorSnapshot() {
      var state = SubtitleEditorSession.snapshot(subtitleEditorState);
      if (state.open) { state.capabilities = subtitleEditorCapabilities(subtitleEditorState); }
      return state;
    }

    function subtitleEditorPreviewPosition(stateValue) {
      return stateValue && stateValue.loop && stateValue.bounds ? stateValue.bounds.start : absoluteTime();
    }

    function canKeepLocalSubtitleEditorPreview(options, localState, tracks, streamId) {
      var track;
      var classification;
      if (!options || options.localSubtitleOverlay !== true || !localState) { return false; }
      track = trackForId(tracks, streamId);
      classification = SubtitleSync ? SubtitleSync.classify(track) : { kind: 'unsupported' };
      if (!track || String(localState.streamId || '') !== String(track.id || '') || playbackSession.streamSwitching() || playbackSession.buffering() || playbackSession.nativeSeekPending()) { return false; }
      if (subtitleRuntime.isAssKind(classification)) { return localState.rendererType === 'ass' && !!localState.content; }
      return classification.kind === 'external-text' && !!(localState.cues && localState.cues.length);
    }

    function subtitleRestoreSeekDecision(stateValue, localState) {
      var hasLocalPayload;
      var position;
      var target;
      if (!localState) { return null; }
      hasLocalPayload = localState.rendererType === 'ass' ? !!localState.content : localState.cues && localState.cues.length;
      if (!stateValue || !hasLocalPayload ||
          playbackSession.streamSwitching() || playbackSession.buffering() || playbackSession.nativeSeekPending() || !playback || !videoDriver) { return null; }
      target = Number(stateValue.position || 0);
      position = absoluteTime();
      if (isFinite(position) && Math.abs(position - target) <= 0.25) { return { operation: 'none', target: target }; }
      return reposition.decide({
        target: target,
        duration: Number(playback.duration || 0) / 1000,
        nativeDuration: videoDriver.duration(),
        offset: Number(playback.offsetBase || 0),
        buffered: ranges(videoDriver.buffered()),
        seekable: ranges(videoDriver.seekable()),
        directPlay: playback.options.delivery === 'direct-play',
        forceRebuild: false
      });
    }

    function rememberPreviewOffset(stateValue, track) {
      var id;
      if (!stateValue || !track) { return; }
      id = String(track.id || '');
      if (!id || Object.prototype.hasOwnProperty.call(stateValue.previewOriginalOffsets, id)) { return; }
      stateValue.previewOriginalOffsets[id] = Math.round(Number(track.offset || 0));
    }

    function drainPreviewWaiters(stateValue) {
      var callbacks;
      var index;
      if (!stateValue || stateValue.previewWriteInFlight || stateValue.previewPendingOffset || stateValue.previewDebounceTimer || stateValue.previewSizeTimer) { return; }
      callbacks = stateValue.previewIdleCallbacks.splice(0);
      for (index = 0; index < callbacks.length; index += 1) { callbacks[index](); }
    }

    function queuePreviewSize(stateValue) {
      if (!stateValue || stateValue.previewMode !== 'server') { return; }
      if (stateValue.previewSizeTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(stateValue.previewSizeTimer); }
      if (!timerRoot.setTimeout) { rebuild(subtitleEditorPreviewPosition(stateValue), false); return; }
      stateValue.previewSizeTimer = timerRoot.setTimeout(function () {
        stateValue.previewSizeTimer = null;
        if (playbackSession.destroyed() || !subtitleEditorState || subtitleEditorState !== stateValue || stateValue.finalizing || stateValue.previewMode !== 'server') {
          drainPreviewWaiters(stateValue); return;
        }
        rebuild(subtitleEditorPreviewPosition(stateValue), false);
        drainPreviewWaiters(stateValue);
      }, 300);
    }

    function flushExternalOffset(stateValue) {
      var pending;
      if (!stateValue || stateValue.previewWriteInFlight || !stateValue.previewPendingOffset) {
        drainPreviewWaiters(stateValue);
        return;
      }
      pending = stateValue.previewPendingOffset;
      stateValue.previewPendingOffset = null;
      stateValue.previewWriteInFlight = true;
      PlexClient.setSubtitleOffset(config, pending.streamId, pending.offsetMs, function (error) {
        var currentStream = subtitleEditorState === stateValue && !playbackSession.destroyed() &&
          String(stateValue.selectedStreamID || '') === String(pending.streamId || '');
        stateValue.previewWriteInFlight = false;
        if (error) {
          if (currentStream) { SubtitleEditorSession.update(stateValue, { previewWriteError: error }); }
          if (currentStream) {
            SubtitleEditorSession.update(stateValue, { status: translate('status.trackError') });
            call(values.onSubtitleEditorState, subtitleEditorSnapshot());
          }
        } else {
          stateValue.previewServerOffsets[pending.streamId] = pending.offsetMs;
        }
        if (stateValue.previewPendingOffset) { flushExternalOffset(stateValue); return; }
        drainPreviewWaiters(stateValue);
      });
    }

    function queueExternalOffset(stateValue, track) {
      if (!stateValue || !track) { return; }
      rememberPreviewOffset(stateValue, track);
      SubtitleEditorSession.update(stateValue, { previewWriteError: null });
      stateValue.previewPendingOffset = {
        streamId: String(track.id || ''),
        offsetMs: Math.round(Number(stateValue.offsetMs || 0))
      };
      if (stateValue.previewDebounceTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(stateValue.previewDebounceTimer); }
      if (!timerRoot.setTimeout) { flushExternalOffset(stateValue); return; }
      stateValue.previewDebounceTimer = timerRoot.setTimeout(function () {
        stateValue.previewDebounceTimer = null;
        flushExternalOffset(stateValue);
      }, 150);
    }

    function whenPreviewIdle(stateValue, callback) {
      if (!stateValue) { call(callback); return; }
      stateValue.previewIdleCallbacks.push(callback);
      if (stateValue.previewDebounceTimer !== null && timerRoot.clearTimeout) {
        timerRoot.clearTimeout(stateValue.previewDebounceTimer);
        stateValue.previewDebounceTimer = null;
      }
      if (stateValue.previewSizeTimer !== null && timerRoot.clearTimeout) {
        timerRoot.clearTimeout(stateValue.previewSizeTimer);
        stateValue.previewSizeTimer = null;
      }
      if (stateValue.previewPendingOffset && !stateValue.previewWriteInFlight) { flushExternalOffset(stateValue); }
      drainPreviewWaiters(stateValue);
    }

    function restorePreviewOffsets(stateValue, keepId, callback) {
      var ids;
      var index;
      var firstError;
      if (!stateValue) { call(callback, null); return; }
      whenPreviewIdle(stateValue, function () {
        index = 0;
        firstError = null;
        ids = Object.keys(stateValue.previewServerOffsets).filter(function (id) {
          return String(id) !== String(keepId || '') &&
            Number(stateValue.previewServerOffsets[id]) !== Number(stateValue.previewOriginalOffsets[id]);
        });
        function next() {
          var id;
          var track;
          var current = stateValue.playbackRef || playback;
          if (index >= ids.length) { call(callback, firstError); return; }
          id = ids[index];
          index += 1;
          PlexClient.setSubtitleOffset(config, id, stateValue.previewOriginalOffsets[id], function (error) {
            if (error && !firstError) { firstError = error; }
            if (!error) {
              track = trackForId(current && current.subtitleTracks, id);
              if (track) { track.offset = stateValue.previewOriginalOffsets[id]; }
              delete stateValue.previewServerOffsets[id];
            }
            next();
          });
        }
        next();
      });
    }

    function loadEditorTrack(stateValue, preserveStream, callback, restartPlan) {
      var track = trackForId(playback && playback.subtitleTracks, stateValue.selectedStreamID);
      var classification = SubtitleSync ? SubtitleSync.classify(track) : { kind: 'unsupported' };
      var requestedMode = playback && (playback.requestedPlaybackMode || playback.options && playback.options.playbackMode) || 'auto';
      var localRenderingEnabled = subtitleRuntime.renderingEnabled(classification) &&
        !(requestedMode === 'transcode' && (classification.kind === 'external-text' || subtitleRuntime.isAssKind(classification)));
      var editorGeneration;
      var fallbackRebuilt = false;
      function fallbackExternalAss() {
        if (!fallbackAssPreview(stateValue, track)) { return false; }
        fallbackRebuilt = true;
        call(callback, null, stateValue);
        return true;
      }
      function refreshPreviewPlan(updateSelection) {
        var target = subtitleEditorPreviewPosition(stateValue);
        if (restartPlan === true) {
          recovery = selectRecovery(playback);
          recovery.position = target;
          applyAttempt(false);
          return;
        }
        rebuild(target, updateSelection === true);
      }
      if (subtitleEditorRequest && subtitleEditorRequest.abort) { subtitleEditorRequest.abort(); }
      subtitleEditorRequest = null;
      subtitleEditorGeneration += 1;
      editorGeneration = subtitleEditorGeneration;
      if (stateValue.previewSizeTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(stateValue.previewSizeTimer); }
      stateValue.previewSizeTimer = null;
      if (stateValue.previewPendingOffset &&
          String(stateValue.previewPendingOffset.streamId || '') !== String(track && track.id || '')) {
        stateValue.previewPendingOffset = null;
        if (stateValue.previewDebounceTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(stateValue.previewDebounceTimer); }
        stateValue.previewDebounceTimer = null;
      }
      SubtitleEditorSession.update(stateValue, {
        cues: [],
        rendererType: null,
        content: '',
        previewError: false,
        previewLoading: false,
        previewWriteError: null,
        offsetMs: track && Object.prototype.hasOwnProperty.call(stateValue.previewServerOffsets, String(track.id || ''))
          ? stateValue.previewServerOffsets[String(track.id || '')]
          : subtitleRuntime.offset(playback, track),
        previewMode: !localRenderingEnabled ? 'server' :
          ((classification.kind === 'external-text' || classification.kind === 'embedded-text') ? 'overlay' :
            (subtitleRuntime.isAssKind(classification) ? 'ass' : 'none'))
      });
      if (!track) {
        stopSubtitlePreviewClock();
        subtitleRuntime.hide();
        SubtitleEditorSession.update(stateValue, { status: '' });
        playback.options.subtitleStreamID = '';
        playback.options.localSubtitleOverlay = false;
        call(values.onSubtitleEditorState, subtitleEditorSnapshot());
        call(callback, null, stateValue);
        if (!preserveStream) { refreshPreviewPlan(false); }
        return;
      }
      if (!localRenderingEnabled) {
        var serverAssOffsetPreview = subtitleRuntime.isAssKind(classification) &&
          Math.round(Number(stateValue.offsetMs || 0)) !== Math.round(Number(track.offset || 0));
        rememberPreviewOffset(stateValue, track);
        stopSubtitlePreviewClock();
        subtitleRuntime.hide();
        subtitleRuntime.disposeAss();
        SubtitleEditorSession.update(stateValue, { previewMode: 'server', status: '' });
        playback.options.subtitleStreamID = String(track.id || '');
        playback.options.localSubtitleOverlay = false;
        call(values.onSubtitleEditorState, subtitleEditorSnapshot());
        call(callback, null, stateValue);
        if (serverAssOffsetPreview) { queueExternalOffset(stateValue, track); }
        if (!preserveStream) { refreshPreviewPlan(true); }
        return;
      }
      if (classification.kind === 'external-text' && stateValue.keepActiveStream && stateValue.originalLocalSubtitleState &&
          String(stateValue.originalLocalSubtitleState.streamId || '') === String(track.id || '') &&
          stateValue.originalLocalSubtitleState.cues && stateValue.originalLocalSubtitleState.cues.length) {
        SubtitleEditorSession.update(stateValue, {
          previewMode: 'overlay',
          cues: stateValue.originalLocalSubtitleState.cues,
          status: ''
        });
        rememberPreviewOffset(stateValue, track);
        playback.options.subtitleStreamID = String(track.id || '');
        playback.options.localSubtitleOverlay = true;
        startSubtitlePreviewClock();
        renderSubtitleOverlay();
        call(values.onSubtitleEditorState, subtitleEditorSnapshot());
        call(callback, null, stateValue);
        return;
      }
      if (subtitleRuntime.isAssKind(classification) && stateValue.keepActiveStream && stateValue.originalLocalSubtitleState &&
          stateValue.originalLocalSubtitleState.rendererType === 'ass' &&
          stateValue.originalLocalSubtitleState.content &&
          String(stateValue.originalLocalSubtitleState.streamId || '') === String(track.id || '')) {
        SubtitleEditorSession.update(stateValue, {
          rendererType: 'ass',
          content: stateValue.originalLocalSubtitleState.content,
          status: ''
        });
        playback.options.subtitleStreamID = String(track.id || '');
        playback.options.localSubtitleOverlay = true;
        startSubtitlePreviewClock();
        renderSubtitleOverlay();
        call(values.onSubtitleEditorState, subtitleEditorSnapshot());
        call(callback, null, stateValue);
        return;
      }
      if (classification.kind !== 'external-text' && classification.kind !== 'embedded-text' && !subtitleRuntime.isAssKind(classification)) {
        SubtitleEditorSession.update(stateValue, { previewError: true, status: translate('player.subtitlePreviewFailed') });
        call(values.onSubtitleEditorState, subtitleEditorSnapshot());
        call(callback, new Error('subtitle unsupported'), stateValue);
        return;
      }
      startSubtitlePreviewClock();
      playback.options.subtitleStreamID = subtitleRuntime.isAssKind(classification) ? String(track.id || '') : '';
      playback.options.localSubtitleOverlay = subtitleRuntime.isAssKind(classification);
      SubtitleEditorSession.update(stateValue, { previewLoading: true, status: translate('player.subtitlePreviewLoading') });
      renderSubtitleOverlay();
      call(values.onSubtitleEditorState, subtitleEditorSnapshot());
      var editorRequestCompleted = false;
      var editorRequest = PlexClient.loadSubtitleText(config, playback, track, function (error, text) {
        var cues;
        editorRequestCompleted = true;
        if (playbackSession.destroyed() || !subtitleEditorState || subtitleEditorState !== stateValue || editorGeneration !== subtitleEditorGeneration ||
            playback !== stateValue.playbackRef || String(stateValue.selectedStreamID || '') !== String(track.id || '')) { return; }
        subtitleEditorRequest = null;
        if (subtitleRuntime.isAssKind(classification)) {
          if (error) {
            if (fallbackExternalAss()) { return; }
            subtitleRuntime.markFailed(track.id);
            stopSubtitlePreviewClock();
            subtitleRuntime.disposeAss();
            SubtitleEditorSession.update(stateValue, {
              previewError: true,
              previewLoading: false,
              status: translate('player.subtitlePreviewFailed')
            });
            call(values.onError, error);
            renderSubtitleOverlay();
            call(values.onSubtitleEditorState, subtitleEditorSnapshot());
            call(callback, error, stateValue);
            return;
          }
          SubtitleEditorSession.update(stateValue, { content: text });
          subtitleRuntime.loadAss(track, text, function (rendererError) {
            if (playbackSession.destroyed() || !subtitleEditorState || subtitleEditorState !== stateValue || editorGeneration !== subtitleEditorGeneration ||
                playback !== stateValue.playbackRef || String(stateValue.selectedStreamID || '') !== String(track.id || '')) { return; }
            SubtitleEditorSession.update(stateValue, { previewLoading: false });
            if (rendererError) {
              if (fallbackExternalAss()) { return; }
              subtitleRuntime.markFailed(track.id);
              stopSubtitlePreviewClock();
              SubtitleEditorSession.update(stateValue, { previewError: true, status: translate('player.subtitlePreviewFailed') });
              subtitleRuntime.disposeAss();
              call(values.onError, rendererError);
              call(values.onSubtitleEditorState, subtitleEditorSnapshot());
              call(callback, rendererError, stateValue);
              return;
            }
            subtitleRuntime.clearFailed(track.id);
            subtitleRuntime.setAssSize(stateValue.subtitleSize);
            SubtitleEditorSession.update(stateValue, { rendererType: 'ass', status: '' });
            renderSubtitleOverlay();
            call(values.onSubtitleEditorState, subtitleEditorSnapshot());
            call(callback, null, stateValue);
          });
          return;
        }
        cues = error || !SubtitleSync ? [] : SubtitleSync.parse(text);
        SubtitleEditorSession.update(stateValue, { previewLoading: false });
        if (error || !cues.length) {
          subtitleRuntime.markFailed(track.id);
          SubtitleEditorSession.update(stateValue, {
            previewError: true,
            status: translate('player.subtitlePreviewFailed'),
            cues: []
          });
          call(values.onError, error || new Error('subtitle preview unavailable'));
        } else {
          SubtitleEditorSession.update(stateValue, { status: '', cues: cues });
        }
        renderSubtitleOverlay();
        call(values.onSubtitleEditorState, subtitleEditorSnapshot());
        call(callback, error || null, stateValue);
      });
      if (!editorRequestCompleted) { subtitleEditorRequest = editorRequest; }
      if (!preserveStream && !fallbackRebuilt) { refreshPreviewPlan(false); }
    }

    function openSubtitleEditor(options) {
      var availability;
      var current = playback;
      var action;
      var target;
      var track;
      var captured;
      var originalLocal;
      var originalOptions;
      var keepActiveStream;
      options = options || {};
      action = options.action || 'open';
      if (action !== 'open') {
        if (!subtitleEditorState || !subtitleEditorState.open || subtitleEditorState.finalizing) { return false; }
        if (!subtitleEditorActionAllowed(action, options)) { return false; }
        if (action === 'set-rendering') {
          subtitleEditorState.globalRenderingChanged = true;
          try { videoDriver.pause(); } catch (renderingPauseError) {}
          loadEditorTrack(subtitleEditorState, false, function () { call(values.onSubtitleEditorState, subtitleEditorSnapshot()); }, true);
        } else if (action === 'set-track') {
          track = trackForId(playback && playback.subtitleTracks, options.streamId);
          if (options.streamId && !subtitleRuntime.editorTrackAllowed(playback, track)) {
            call(values.onSubtitleUnavailable, { enabled: false, reason: 'unsupported' });
            return false;
          }
          SubtitleEditorSession.update(subtitleEditorState, { selectedStreamID: options.streamId, keepActiveStream: false });
          loadEditorTrack(subtitleEditorState, false, function () { call(values.onSubtitleEditorState, subtitleEditorSnapshot()); });
        } else if (action === 'set-size') {
          SubtitleEditorSession.update(subtitleEditorState, { subtitleSize: options.size });
          if (playback) { playback.options.subtitleSize = subtitleEditorState.subtitleSize; }
          if (subtitleEditorState.previewMode === 'ass') { subtitleRuntime.setAssSize(subtitleEditorState.subtitleSize); }
          renderSubtitleOverlay();
          queuePreviewSize(subtitleEditorState);
        } else if (action === 'adjust-offset') {
          SubtitleEditorSession.update(subtitleEditorState, { offsetMs: SubtitleSync.adjust(subtitleEditorState.offsetMs, Number(options.delta || 0)) });
          track = trackForId(playback && playback.subtitleTracks, subtitleEditorState.selectedStreamID);
          if (track && subtitleEditorState.previewMode === 'server') { queueExternalOffset(subtitleEditorState, track); }
          renderSubtitleOverlay();
        } else if (action === 'seek') {
          target = Math.max(0, Math.min(Number(playback && playback.duration || 0) / 1000, absoluteTime() + Number(options.delta || 0)));
          SubtitleEditorSession.update(subtitleEditorState, { bounds: { start: target, end: Math.min(Number(playback.duration || 0) / 1000, target + 5) } });
          seekAbsolute(target, { source: 'subtitle-editor' });
        } else if (action === 'toggle-loop') {
          SubtitleEditorSession.update(subtitleEditorState, { loop: !subtitleEditorState.loop });
        }
        call(values.onSubtitleEditorState, subtitleEditorSnapshot());
        return true;
      }
      if (!current || !SubtitleSync || subtitleEditorState && subtitleEditorState.open) { return false; }
      availability = subtitleRuntime.editorAvailability(current);
      if (!availability.enabled) { call(values.onSubtitleUnavailable, availability); return false; }
      captured = absoluteTime();
      timeline.setSuppressed(true);
      timeline.stopReporting();
      originalOptions = copyObject(current.options);
      originalLocal = subtitleRuntime.localState();
      keepActiveStream = canKeepLocalSubtitleEditorPreview(originalOptions, originalLocal, current.subtitleTracks, originalOptions.subtitleStreamID);
      subtitleRuntime.clearLocal();
      subtitleEditorState = SubtitleEditorSession.open({
        selectedStreamID: current.options.subtitleStreamID,
        subtitleSize: current.options.subtitleSize,
        position: captured,
        paused: !!videoDriver.paused(),
        bounds: SubtitleSync.loopBounds(captured, Number(current.duration || 0) / 1000),
        playbackRef: current,
        originalOptions: originalOptions,
        originalLocalSubtitleState: originalLocal,
        keepActiveStream: keepActiveStream
      });
      current.options = copyObject(subtitleEditorState.originalOptions);
      current.options.localSubtitleOverlay = keepActiveStream;
      loadEditorTrack(subtitleEditorState, true, function () { call(values.onSubtitleEditorState, subtitleEditorSnapshot()); });
      if (subtitleEditorState.previewMode !== 'server' && !subtitleEditorState.keepActiveStream) {
        if (subtitleEditorState.previewMode !== 'ass') { current.options.subtitleStreamID = ''; }
        videoDriver.pause();
        recovery = selectRecovery(current);
        recovery.position = subtitleEditorState.bounds.start;
        rebuild(subtitleEditorState.bounds.start, false);
      }
      call(values.onSubtitleEditorState, subtitleEditorSnapshot());
      return true;
    }

    function finishSubtitleRestore(stateValue, options, localState, callback, preserveStream, restartPlan) {
      var keepStream;
      if (!playback || !stateValue) { call(callback, new Error('playback unavailable')); return; }
      stopSubtitlePreviewClock();
      if (stateValue.previewSizeTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(stateValue.previewSizeTimer); }
      if (subtitleEditorRequest && subtitleEditorRequest.abort) { subtitleEditorRequest.abort(); }
      subtitleEditorRequest = null;
      subtitleEditorState = null;
      playback.options = options;
      subtitleRuntime.setLocal(localState);
      function completeRestore(rendererError) {
        var restoreDecision;
        var restoredLocal;
        if (rendererError) {
          call(values.onError, rendererError);
          subtitleRuntime.clearLocal();
          playback.options.localSubtitleOverlay = false;
        }
        restoredLocal = subtitleRuntime.localState();
        if (restoredLocal) { renderSubtitleOverlay(); }
        else { call(values.hideSubtitleOverlay); }
        restoreDecision = !rendererError && preserveStream === true ? subtitleRestoreSeekDecision(stateValue, restoredLocal) : null;
        keepStream = !!(restoreDecision && (restoreDecision.operation === 'none' || restoreDecision.operation === 'native'));
        if (keepStream) {
          pendingRestore = null;
          timeline.freeze(false);
          if (restoreDecision.operation === 'native') { seekAbsolute(stateValue.position, { immediate: true, source: 'subtitle-restore' }); }
          timeline.setSuppressed(false);
          setLoading(false);
          if (stateValue.paused) {
            try { videoDriver.pause(); } catch (error) {}
            setStatus('paused');
          } else {
            setStatus('playing');
          }
          startReporting();
          report(stateValue.paused ? 'paused' : 'playing');
          renderProgress(displayTime(), Number(playback.duration || 0) / 1000);
          resetSubtitlePreviewWrites(stateValue);
          call(values.onSubtitleEditorState, { open: false });
          notifyState();
          call(callback, null, snapshot());
          return;
        }
        call(values.hideSubtitleOverlay);
        pendingRestore = { paused: stateValue.paused };
        if (restartPlan === true || stateValue.globalRenderingChanged === true) {
          recovery = selectRecovery(playback);
          recovery.position = stateValue.position;
          applyAttempt(false);
        } else { rebuild(stateValue.position, false); }
        resetSubtitlePreviewWrites(stateValue);
        call(values.onSubtitleEditorState, { open: false });
        call(callback, rendererError || null, snapshot());
      }
      if (localState && localState.rendererType === 'ass' && localState.content) {
        subtitleRuntime.loadAss({ id: localState.streamId }, localState.content, completeRestore);
      } else {
        subtitleRuntime.disposeAss();
        completeRestore(null);
      }
    }

    function restoreCancelledSubtitleApply(stateValue, callback) {
      function restoreSelection() {
        if (playbackSession.destroyed() || !subtitleEditorState || subtitleEditorState !== stateValue || !playback) { return; }
        PlexClient.setStreamSelection(config, playback, stateValue.originalOptions, function (error) {
          if (playbackSession.destroyed() || !subtitleEditorState || subtitleEditorState !== stateValue) { return; }
          if (error) {
            SubtitleEditorSession.update(stateValue, {
              applying: false,
              finalizing: false,
              status: translate('status.trackError')
            });
            call(values.onSubtitleEditorState, subtitleEditorSnapshot());
            call(callback, error);
            return;
          }
          if (stateValue.globalRenderingChanged === true) {
            var restoredOptions = copyObject(stateValue.originalOptions);
            playback.options = restoredOptions;
            configureLocalSubtitles(playback, function () {
              var restoredLocal = subtitleRuntime.localState();
              restoredOptions.localSubtitleOverlay = !!restoredLocal;
              finishSubtitleRestore(stateValue, restoredOptions, restoredLocal, callback, false);
            });
            return;
          }
          finishSubtitleRestore(stateValue, copyObject(stateValue.originalOptions), stateValue.originalLocalSubtitleState, callback,
            stateValue.keepActiveStream === true);
        });
      }
      SubtitleEditorSession.update(stateValue, { finalizing: true });
      restorePreviewOffsets(stateValue, '', function () { restoreSelection(); });
    }

    function failSubtitleApply(stateValue, error, restoreSelection, callback) {
      function finish(selectionError) {
        if (playbackSession.destroyed() || !subtitleEditorState || subtitleEditorState !== stateValue) { return; }
        SubtitleEditorSession.update(stateValue, {
          applying: false,
          finalizing: false,
          status: translate('status.trackError')
        });
        call(values.onSubtitleEditorState, subtitleEditorSnapshot());
        call(callback, error || selectionError || new Error('subtitle apply failed'));
      }
      if (restoreSelection && playback) { PlexClient.setStreamSelection(config, playback, stateValue.originalOptions, finish); }
      else { finish(); }
    }

    function applySubtitleEditor(options, callback) {
      var stateValue = subtitleEditorState;
      var current = playback;
      var nextOptions;
      var track;
      var classification;
      var serverAss;
      var rendering;
      var localAssDisabled;
      var localTextDisabled;
      var preserveLocalAssStream;
      var preserveEditorStream;
      options = options || {};
      if (!stateValue || !stateValue.open || stateValue.applying || !current) { call(callback, new Error('subtitle editor closed')); return false; }
      track = trackForId(current.subtitleTracks, stateValue.selectedStreamID);
      classification = SubtitleSync ? SubtitleSync.classify(track) : { kind: 'unsupported' };
      rendering = options.rendering || call(values.subtitleRendering) || {};
      serverAss = !!(track && subtitleRuntime.isAssKind(classification) && stateValue.previewMode === 'server');
      localAssDisabled = !!(track && subtitleRuntime.isAssKind(classification) && rendering.ass !== true);
      localTextDisabled = !!(track && (classification.kind === 'external-text' || classification.kind === 'embedded-text') && rendering.srt !== true);
      preserveLocalAssStream = !!(track && subtitleRuntime.isAssKind(classification) && stateValue.previewMode === 'ass' &&
        !localAssDisabled && current.options.localSubtitleOverlay === true);
      preserveEditorStream = subtitleRuntime.isAssKind(classification) ? preserveLocalAssStream : stateValue.keepActiveStream === true;
      if (track && (stateValue.previewMode === 'overlay' || stateValue.previewMode === 'ass') && stateValue.previewError) {
        SubtitleEditorSession.update(stateValue, { status: translate('player.subtitlePreviewFailed') });
        call(values.onSubtitleEditorState, subtitleEditorSnapshot());
        call(callback, new Error('subtitle preview unavailable'));
        return false;
      }
      if (track && stateValue.previewMode === 'overlay' && (!stateValue.cues.length || subtitleEditorRequest)) {
        SubtitleEditorSession.update(stateValue, { status: translate('player.subtitlePreviewLoading') });
        call(values.onSubtitleEditorState, subtitleEditorSnapshot());
        call(callback, new Error('subtitle preview loading'));
        return false;
      }
      if (track && stateValue.previewMode === 'ass' && (stateValue.previewLoading || subtitleEditorRequest || stateValue.rendererType !== 'ass')) {
        SubtitleEditorSession.update(stateValue, { status: translate('player.subtitlePreviewLoading') });
        call(values.onSubtitleEditorState, subtitleEditorSnapshot());
        call(callback, new Error('subtitle preview loading'));
        return false;
      }
      nextOptions = copyObject(stateValue.originalOptions);
      nextOptions.subtitleStreamID = stateValue.selectedStreamID;
      nextOptions.subtitleSize = stateValue.subtitleSize;
      if (serverAss || localAssDisabled) {
        nextOptions.localSubtitleOverlay = false;
      } else if (track && (classification.kind === 'external-text' && stateValue.previewMode === 'overlay' ||
          subtitleRuntime.isAssKind(classification) && stateValue.previewMode === 'ass')) {
        nextOptions.localSubtitleOverlay = true;
      }
      SubtitleEditorSession.commit(stateValue, translate('status.preparing'));
      call(values.onSubtitleEditorState, subtitleEditorSnapshot());
      restorePreviewOffsets(stateValue, track && (classification.kind === 'external-text' || serverAss) ? track.id : '', function (offsetError) {
        if (playbackSession.destroyed() || !subtitleEditorState || subtitleEditorState !== stateValue) { return; }
        if (stateValue.cancelRequested) { restoreCancelledSubtitleApply(stateValue, callback); return; }
        if (offsetError || stateValue.previewWriteError) { failSubtitleApply(stateValue, offsetError || stateValue.previewWriteError, false, callback); return; }
        PlexClient.setStreamSelection(config, current, nextOptions, function (selectionError) {
          var stored = true;
          var localState = null;
          if (playbackSession.destroyed() || !subtitleEditorState || subtitleEditorState !== stateValue || playback !== current) { return; }
          if (stateValue.cancelRequested) { restoreCancelledSubtitleApply(stateValue, callback); return; }
          if (selectionError) { failSubtitleApply(stateValue, selectionError, false, callback); return; }
          if (track && (classification.kind === 'external-text' || serverAss) && stateValue.previewMode !== 'overlay') {
            track.offset = stateValue.offsetMs;
          }
          if (track && serverAss && classification.kind === 'embedded-ass') {
            stored = SubtitleOffsetStore.set(storage, subtitleIdentity(), current.partId, track.id, stateValue.offsetMs);
          }
          if (track && classification.kind === 'external-text' && stateValue.previewMode === 'overlay') {
            localState = { cues: stateValue.cues, offsetMs: stateValue.offsetMs, streamId: track.id, size: stateValue.subtitleSize };
          } else if (track && subtitleRuntime.isAssKind(classification) && !serverAss) {
            if (classification.kind !== 'external-ass') { stored = SubtitleOffsetStore.set(storage, subtitleIdentity(), current.partId, track.id, stateValue.offsetMs); }
            if (!localAssDisabled) {
              nextOptions.localSubtitleOverlay = true;
              localState = { rendererType: 'ass', content: stateValue.content, cues: null, offsetMs: stateValue.offsetMs, streamId: track.id, size: stateValue.subtitleSize };
            }
          } else if (track && classification.kind === 'embedded-text' && stateValue.offsetMs !== 0 && !localTextDisabled) {
            stored = SubtitleOffsetStore.set(storage, subtitleIdentity(), current.partId, track.id, stateValue.offsetMs);
            nextOptions.localSubtitleOverlay = true;
            localState = { cues: stateValue.cues, offsetMs: stateValue.offsetMs, streamId: track.id, size: stateValue.subtitleSize };
          } else {
            nextOptions.localSubtitleOverlay = false;
            if (track && classification.kind === 'embedded-text') { stored = SubtitleOffsetStore.remove(storage, subtitleIdentity(), current.partId, track.id); }
          }
          if (!stored) { failSubtitleApply(stateValue, new Error('subtitle offset storage failed'), true, callback); return; }
          if (track && ((classification.kind === 'external-text' && stateValue.previewMode === 'overlay') ||
              (classification.kind === 'external-ass' && !serverAss))) {
            PlexClient.setSubtitleOffset(config, track.id, stateValue.offsetMs, function (offsetError) {
              if (playbackSession.destroyed() || !subtitleEditorState || subtitleEditorState !== stateValue || playback !== current) { return; }
              if (offsetError) { failSubtitleApply(stateValue, offsetError, true, callback); return; }
              track.offset = stateValue.offsetMs;
              if (classification.kind === 'external-ass' && (!preserveLocalAssStream || localAssDisabled)) {
                current.options = nextOptions;
                recovery = selectRecovery(current);
                recovery.position = stateValue.position;
              }
              finishSubtitleRestore(stateValue, nextOptions, localState, callback, preserveEditorStream,
                localAssDisabled && stateValue.previewMode === 'ass');
            });
            return;
          }
          if (track && subtitleRuntime.isAssKind(classification) && !serverAss && (!preserveLocalAssStream || localAssDisabled)) {
            current.options = nextOptions;
            recovery = selectRecovery(current);
            recovery.position = stateValue.position;
          }
          finishSubtitleRestore(stateValue, nextOptions, localState, callback,
            subtitleRuntime.isAssKind(classification) && !serverAss && preserveLocalAssStream,
            localAssDisabled && stateValue.previewMode === 'ass');
        });
      });
      return true;
    }

    function cancelSubtitleEditor(callback) {
      var stateValue = subtitleEditorState;
      if (!stateValue || !stateValue.open || !playback) { call(callback, null, snapshot()); return false; }
      var transition = SubtitleEditorSession.cancel(stateValue, translate('status.preparing'));
      if (!transition.accepted) { call(callback, null, snapshot()); return false; }
      call(values.onSubtitleEditorState, subtitleEditorSnapshot());
      if (transition.deferred) { return true; }
      restoreCancelledSubtitleApply(stateValue, callback);
      return true;
    }

    function open(request, callback) {
      var detail;
      var ratingKey;
      var session;
      var startOffset;
      var openGeneration;
      var loadGeneration;
      var loadRequest;
      var loadCompleted = false;
      var ir;
      var prior;
      var e;
      request = request || {};
      ir = request.internalReopen === true;
      prior = ir ? PlaybackRecovery.current(recovery) : null;
      if (!ir) { recoveryTrace = ''; }
      detail = request.detail || request.item || null;
      ratingKey = detail && detail.ratingKey;
      if (playbackSession.destroyed() || !ratingKey) { call(callback, new Error('playback item unavailable')); return false; }
      playbackSession.markTerminalPlayback(false);
      if (playback) { report('stopped'); }
      generation += 1;
      debugSourceGeneration = 0;
      debugBufferGeneration = 0;
      openGeneration = generation;
      debugPlayback('open-request', { playbackGeneration: generation, action: ir ? 'internal-reopen' : 'open', reason: ir ? String(request.reopenReason || '') : '' });
      closeInternal(true, ir);
      loadGeneration = playbackLoadGeneration;
      subtitleRuntime.resetFailures();
      if (!ir) { call(values.onOpening, request); }
      playbackSession.prepare();
      setStatus('preparing');
      playbackSession.beginStreamSwitch('starting');
      setLoading(true);
      session = request.session || 'ploff-' + new Date().getTime();
      startOffset = request.startOffset;
      loadRequest = PlexClient.loadPlayback(config, ratingKey, session, request.preferences || call(values.playbackPreferences, request) || {}, function (error, loaded) {
        var resolvedStart;
        loadCompleted = true;
        if (playbackLoadRequest === loadRequest) { playbackLoadRequest = null; }
        if (playbackSession.destroyed() || openGeneration !== generation || loadGeneration !== playbackLoadGeneration || !active()) { return; }
        if (error || !loaded) {
          playbackSession.finishStreamSwitch();
          setStatus('stream-error');
          call(values.onError, error || new Error('playback unavailable'));
          call(values.showError, false, retry);
          call(callback, error || new Error('playback unavailable'));
          return;
        }
        playback = loaded;
        playback.diagnosticRecoveryTrace = recoveryTrace;
        e = ir && subtitleEditorState;
        if (e) { e.playbackRef = loaded; }
        resolvedStart = startOffset === null || startOffset === undefined ? Math.max(0, Number(loaded.resumePosition || 0)) : Math.max(0, Number(startOffset || 0));
        playback.resumePosition = resolvedStart;
        playback.options.offset = resolvedStart;
        playback.offsetBase = resolvedStart;
        debugPlayback('playback-loaded', { recoveryTarget: resolvedStart, offsetBase: resolvedStart });
        playback.requestedPlaybackMode = loaded.options.playbackMode || 'auto';
        playback.requestedVideoQuality = loaded.options.videoQuality || 'original';
        clockRepairCount = 0;
        anchorClock(resolvedStart, true);
        if (ir) { pendingRestore = { paused: request.preservePaused === true, reopen: true }; }
        configureLocalSubtitles(playback, function () {
          if (playbackSession.destroyed() || openGeneration !== generation || playback !== loaded) { return; }
          recovery = selectRecovery(loaded, prior);
          recovery.position = resolvedStart;
          videoDriver.setAutoplay(false);
          if (!ir) { call(values.onPlaybackLoaded, loaded, request, snapshot()); }
          if (e && subtitleEditorState === e) {
            timeline.setSuppressed(true);
            if (e.previewLoading) { loadEditorTrack(e, true); }
            else if (e.previewMode === 'overlay' || e.previewMode === 'ass') { startSubtitlePreviewClock(); }
          } else { startReporting(); }
          applyAttempt(false);
          call(callback, null, snapshot());
        }, ir);
      });
      if (!loadCompleted && !playbackSession.destroyed() && openGeneration === generation && loadGeneration === playbackLoadGeneration) { playbackLoadRequest = loadRequest || null; }
      else if (!loadCompleted && loadRequest && loadRequest.abort) { loadRequest.abort(); }
      return true;
    }

    function startItem(item, options, callback) {
      var requestGeneration = generation;
      var loadGeneration;
      var loadRequest;
      var loadCompleted = false;
      options = options || {};
      if (!item) { call(callback, new Error('playback item unavailable')); return false; }
      if (options.detail) {
        options.item = item;
        return open(options, callback);
      }
      cancelPlaybackLoadRequest();
      loadGeneration = playbackLoadGeneration;
      loadRequest = PlexClient.loadMetadata(config, item.ratingKey, function (error, detail) {
        loadCompleted = true;
        if (playbackLoadRequest === loadRequest) { playbackLoadRequest = null; }
        if (playbackSession.destroyed() || requestGeneration !== generation || loadGeneration !== playbackLoadGeneration) { return; }
        if (error || !detail) { call(callback, error || new Error('metadata unavailable')); return; }
        options.item = item;
        options.detail = detail;
        open(options, callback);
      });
      if (!loadCompleted && !playbackSession.destroyed() && requestGeneration === generation && loadGeneration === playbackLoadGeneration) {
        playbackLoadRequest = loadRequest || null;
      } else if (!loadCompleted && loadRequest && loadRequest.abort) {
        loadRequest.abort();
      }
      return true;
    }

    function startAdjacent(direction, callback) {
      var requestGeneration = generation;
      if (typeof values.resolveAdjacent !== 'function') { call(callback, new Error('adjacent item unavailable')); return false; }
      values.resolveAdjacent(direction, function (error, target) {
        if (playbackSession.destroyed() || requestGeneration !== generation) { return; }
        if (error || !target) { call(callback, error || new Error('adjacent item unavailable')); return; }
        startItem(target.item || target.episode || target, {
          detail: target.detail,
          startOffset: target.startOffset,
          preferences: target.preferences,
          versionAffinity: target.versionAffinity,
          adjacentTarget: target
        }, function (startError, result) {
          if (!startError) { call(values.onAdjacentStarted, target, result); }
          call(callback, startError || null, result);
        });
      });
      return true;
    }

    function closeInternal(clearSource, preserveAss) {
      var closingEditor = subtitleEditorState;
      var hadPlayback = !!playback;
      if (hadPlayback) { playbackSession.armReopenStartupGuard(); }
      cancelPlaybackLoadRequest();
      cancelPlaybackPrepareRequest();
      stopBuffering();
      timeline.stopKeepalive();
      timeline.stopReporting();
      stopSubtitlePreviewClock();
      cancelLocalSubtitleRequest();
      if (preserveAss) { subtitleRuntime.hide(); }
      else { subtitleRuntime.disposeAss(); }
      if (recoveryTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(recoveryTimer); }
      if (resumeTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(resumeTimer); }
      if (seekTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(seekTimer); }
      if (nativeSeekVerificationTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(nativeSeekVerificationTimer); }
      if (clockRepairTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(clockRepairTimer); }
      if (clockRepairFallbackTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(clockRepairFallbackTimer); }
      recoveryTimer = null;
      resumeTimer = null;
      seekTimer = null;
      nativeSeekVerificationTimer = null;
      clockRepairTimer = null;
      clockRepairFallbackTimer = null;
      pendingSeek = null;
      playbackSession.setPendingTerminalPause(false);
      playbackSession.markTerminalPlayback(false);
      pendingRestore = null;
      if (!preserveAss) { subtitleRuntime.resetSeekPresentation(); }
      subtitleRuntime.clearLocal();
      if (closingEditor && !preserveAss) {
        closingEditor.open = false;
        closingEditor.finalizing = true;
        restorePreviewOffsets(closingEditor, '', function () { resetSubtitlePreviewWrites(closingEditor); });
        subtitleEditorState = null;
      } else if (closingEditor && closingEditor.previewSizeTimer !== null && timerRoot.clearTimeout) {
        timerRoot.clearTimeout(closingEditor.previewSizeTimer);
        closingEditor.previewSizeTimer = null;
      }
      subtitleEditorGeneration += 1;
      if (subtitleEditorRequest && subtitleEditorRequest.abort) { subtitleEditorRequest.abort(); }
      subtitleEditorRequest = null;
      playbackSession.resetForClose(hadPlayback);
      reposition.clear();
      recovery = PlaybackRecovery.create([]);
      timeline.reset();
      clockRepairCount = 0;
      if (clearSource && videoDriver) {
        videoDriver.clearSource();
      }
      playback = null;
      call(values.hideSubtitleOverlay);
      setLoading(false);
    }

    function close(callback) {
      var current = playback;
      var ratingKey = current && current.ratingKey;
      var position;
      var reported;
      generation += 1;
      if (!current) { closeInternal(true); call(callback, 0, false, ratingKey); return false; }
      position = publicTime();
      reported = timeline.report(current, 'stopped', position, durationSeconds(), playbackSession.terminalPlayback(), function (reportPosition, didReport) {
        if (!playbackSession.destroyed()) { call(values.onClosed, reportPosition, didReport, ratingKey); }
      });
      closeInternal(true);
      call(callback, position, reported, ratingKey);
      return true;
    }

    function publishPlayingState() {
      playbackSession.finishNativePlay();
      if (resumeTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(resumeTimer); }
      resumeTimer = null;
      playbackSession.markPlaying();
      timeline.freeze(false);
      recovery = PlaybackRecovery.playing(recovery);
      rememberCompatibilitySuccess();
      call(values.hideError);
      startKeepalive();
      if (!playbackSession.nativeSeekPending() && !(reposition.pending() && reposition.holdReport())) { setLoading(false); }
      setStatus('playing');
      if (pendingRestore) {
        pendingRestore = null;
        timeline.setSuppressed(false);
        startReporting();
      }
      if (reposition.pending() && reposition.holdReport()) { playbackSession.setDecoderReportPending(true); }
      else { report('playing'); }
      renderProgress(displayTime(), Number(playback.duration || 0) / 1000);
      releaseSubtitleSeekGate();
      renderSubtitleOverlay();
      notifyState();
    }

    function onPlaying() {
      var wasBuffering;
      if (!active() || !playback) { return; }
      debugPlayback('native-playing');
      if (playbackSession.shouldRejectPlaying()) {
        playbackSession.finishNativePlay();
        try { videoDriver.pause(); } catch (error) {}
        timeline.freeze(true);
        return;
      }
      if (playbackSession.terminalPlayback() || playback.terminalEndPause) {
        try { videoDriver.pause(); } catch (error) {}
        setLoading(false);
        return;
      }
      if (subtitleRuntime.seekPresentationPending()) { subtitleRuntime.markSeekPlaying(); }
      wasBuffering = playbackSession.buffering();
      if (wasBuffering && resolveBufferResume()) { return; }
      if (!wasBuffering) { stopBuffering(); }
      publishPlayingState();
    }

    function onCanPlay() {
      var nativeTarget = null;
      var absoluteTarget = null;
      if (!active() || !playback) { return; }
      debugPlayback('native-canplay');
      if (!playbackSession.nativeSourceAssigned()) { return; }
      if (playbackSession.streamSwitching() && playback.options.delivery !== 'direct-play' && Number(videoDriver.readyState()) < 3) { return; }
      playbackSession.markSourceReady();
      if (playbackSession.terminalPlayback()) {
        try { videoDriver.pause(); } catch (error) {}
        retireBufferingIncident('terminal-canplay', true);
        setLoading(false);
        return;
      }
      if (!playbackSession.buffering()) { stopBuffering(); }
      if (playback.terminalEndPause) {
        nativeTarget = terminalNativeEndTarget();
        absoluteTarget = durationSeconds();
        playback.terminalNativeSeekTarget = null;
        playback.terminalSeekTarget = null;
      }
      else if (playback.directSeekTarget !== null && playback.directSeekTarget !== undefined) {
        nativeTarget = Number(playback.directSeekTarget || 0);
        absoluteTarget = nativeTarget;
        playback.directSeekTarget = null;
      }
      else if (playback.terminalNativeSeekTarget !== null && playback.terminalNativeSeekTarget !== undefined) {
        nativeTarget = Number(playback.terminalNativeSeekTarget || 0);
        absoluteTarget = Number(playback.terminalSeekTarget || 0);
        playback.terminalNativeSeekTarget = null;
        playback.terminalSeekTarget = null;
      }
      if (nativeTarget !== null && nativeTarget > 0.25) {
        armNativeSeekVerification(absoluteTarget, nativeTarget);
        try { videoDriver.seek(nativeTarget); }
        catch (error) {
          playbackSession.finishNativeSeek();
          if (nativeSeekVerificationTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(nativeSeekVerificationTimer); }
          nativeSeekVerificationTimer = null;
          recover.apply(null, [error, 'seek']);
          return;
        }
        return;
      }
      if (playbackSession.streamSwitching()) { resumeRebuiltStream(); }
      else if (videoDriver.paused()) { requestNativePlay(); }
    }

    function onWaiting() {
      var event = arguments[0] || {};
      var signal = String(event.type || 'waiting');
      if (!active() || !playback) { return; }
      if (subtitleRuntime.seekPresentationPending()) { subtitleRuntime.markSeekRebuffer(); }
      if (playbackSession.terminalPlayback() || playbackSession.streamSwitching() || playbackSession.nativeSeekPending() || videoDriver.paused()) { return; }
      debugPlayback(signal === 'stalled' ? 'native-stalled' : 'native-waiting', { signal: signal });
      debugPendingBufferSignal = signal;
      beginBufferingIncident();
    }

    function onSeeking() {
      if (!active() || !playback) { return; }
      debugPlayback('native-seeking');
      syncAssPlaybackClock(true);
      timeline.freeze(true);
    }

    function onSeeked() {
      var observation;
      var settled = false;
      var expected = playbackSession.nativeSeekPending();
      var expectedNative = playbackSession.nativeSeekTarget();
      var expectedAbsolute = playbackSession.nativeSeekAbsoluteTarget();
      if (!active() || !playback) { return; }
      debugPlayback('native-seeked', { nativeSeekTarget: expectedNative, absoluteSeekTarget: expectedAbsolute });
      if (playbackSession.streamSwitching() && !playbackSession.nativeSourceAssigned()) { return; }
      if (clockRepairFallbackTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(clockRepairFallbackTimer); }
      if (nativeSeekVerificationTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(nativeSeekVerificationTimer); }
      clockRepairFallbackTimer = null;
      nativeSeekVerificationTimer = null;
      playbackSession.finishNativeSeek();
      if (subtitleRuntime.seekPresentationPending() && Number(videoDriver.readyState()) < 3) { subtitleRuntime.markSeekRebuffer(); }
      if (expected && expectedNative !== null && !reposition.reached(expectedNative, videoDriver.currentTime())) {
        if (!playbackSession.streamSwitching() && expectedAbsolute !== null && (expectedAbsolute > 0.25 || playback.options.delivery !== 'direct-play')) {
          armDecoderSettlement(expectedAbsolute, 'seek', false);
          settled = settleDecoder(videoDriver.currentTime());
          if (!settled) { reposition.clear(); }
        }
        if (!settled) {
          recoveryRebuild(expectedAbsolute !== null ? expectedAbsolute : Number(playback.offsetBase || 0) + Number(expectedNative || 0), 'seek-mismatch');
          return;
        }
      }
      if (playbackSession.streamSwitching()) {
        if (expected && expectedAbsolute !== null && expectedAbsolute > 0.25 && playback.options.delivery === 'direct-play') {
          armDecoderSettlement(expectedAbsolute, 'startup', true);
        }
        resumeRebuiltStream();
        notifyState();
        return;
      }
      if (!playbackSession.streamSwitching() && !playbackSession.buffering()) {
        timeline.freeze(false);
        observation = timeline.observe(Number(playback.offsetBase || 0), Number(videoDriver.currentTime() || 0), expected);
        if (!settled && expected && expectedAbsolute !== null && (expectedAbsolute > 0.25 || playback.options.delivery !== 'direct-play')) {
          armDecoderSettlement(expectedAbsolute, 'seek', false);
        }
        if (observation.desynced) { scheduleClockRepair(); }
        setLoading(false);
        renderProgress(displayTime(), Number(playback.duration || 0) / 1000);
        syncAssPlaybackClock(!!(videoDriver && videoDriver.paused()));
        if (pendingRestore) {
          if (pendingRestore.paused) { videoDriver.pause(); }
          else if (videoDriver.paused()) { requestNativePlay(); }
          pendingRestore = null;
        }
      }
      notifyState();
    }

    function onPause() {
      var preserveBuffering = playbackSession.buffering() && !playbackSession.streamSwitching() && !playbackSession.terminalPlayback();
      debugPlayback('native-pause');
      if (preserveBuffering) { pauseBufferingIncident(); }
      else { stopBuffering(); }
      if (playbackSession.streamSwitching() || playbackSession.terminalPlayback() || !active() || !playback) { return; }
      playbackSession.finishNativePlay();
      if (!preserveBuffering) { timeline.freeze(false); }
      setLoading(false);
      setStatus('paused');
      syncAssPlaybackClock(true);
      report('paused');
      renderProgress(displayTime(), Number(playback.duration || 0) / 1000);
      notifyState();
    }

    function onTimeUpdate() {
      if (!playback) { return; }
      debugPlayback('native-timeupdate');
      if (playbackSession.buffering() && !playbackSession.streamSwitching() && !playbackSession.nativeSeekPending() &&
          !playbackSession.terminalPlayback() && videoDriver && !videoDriver.paused() && Number(videoDriver.readyState()) >= 3) {
        if (!resolveBufferResume()) { publishPlayingState(); }
      } else if (!playbackSession.buffering() && !playbackSession.streamSwitching() && !playbackSession.nativeSeekPending() &&
          !playbackSession.terminalPlayback() && videoDriver && !videoDriver.paused() && Number(videoDriver.readyState()) < 3) {
        debugPendingBufferSignal = 'low-ready-state';
        beginBufferingIncident();
      }
      renderProgress(displayTime(), durationSeconds());
      releaseDecoderReport();
      if (subtitleEditorState && subtitleEditorState.open && subtitleEditorState.loop &&
          absoluteTime() >= subtitleEditorState.bounds.end - 0.05 && !playbackSession.streamSwitching()) {
        seekAbsolute(subtitleEditorState.bounds.start, { immediate: true, source: 'subtitle-loop' });
      }
      releaseSubtitleSeekGate();
      renderSubtitleOverlay();
      notifyState();
    }

    function onEnded() {
      if (playbackSession.streamSwitching() || playbackSession.terminalPlayback() || !playback || playback.terminalEndPause) { return; }
      debugPlayback('native-ended');
      retireBufferingIncident('ended', true);
      playbackSession.markTerminalPlayback(true);
      timeline.freeze(true);
      renderProgress(durationSeconds(), durationSeconds());
      report('stopped');
      setStatus('ended');
      call(values.onEnded, snapshot());
    }

    function onError() {
      if (!active() || recoveryTimer !== null || playbackPrepareRequest) { return; }
      debugPlayback('native-error');
      retireBufferingIncident('native-error', false);
      setStatus('playback-error');
      recover.apply(null, [videoDriver && videoDriver.error() || new Error('native playback error'), 'native']);
    }

    function bind(target, name, handler) {
      if (!target || !target.addEventListener) { return; }
      target.addEventListener(name, handler, false);
      listeners.push({ target: target, name: name, handler: handler });
    }

    function bindVideo(name, handler) {
      if (!videoDriver) { return; }
      videoDriver.on(name, handler);
      listeners.push({ driver: videoDriver, name: name, handler: handler });
    }

    function bindEvents() {
      bindVideo('playing', onPlaying);
      bindVideo('canplay', onCanPlay);
      bindVideo('waiting', onWaiting);
      bindVideo('stalled', onWaiting);
      bindVideo('seeking', onSeeking);
      bindVideo('seeked', onSeeked);
      bindVideo('pause', onPause);
      bindVideo('timeupdate', onTimeUpdate);
      bindVideo('ended', onEnded);
      bindVideo('error', onError);
      if (visibilityTarget) {
        bind(visibilityTarget, 'visibilitychange', function () {
          if (visibilityTarget.hidden) { timeline.stopReporting(); }
          else if (active() && playback) { startReporting(); }
        });
      }
      if (typeof values.subscribeNetwork === 'function') {
        networkUnsubscribe = values.subscribeNetwork(function (network) {
          if (!playback) { return; }
          if (call(values.networkAvailable, network) === false) {
            setStatus('waiting-network');
            return;
          }
          if (recovery.status === 'waiting-network') {
            recovery = PlaybackRecovery.online(recovery);
            call(values.hideError);
            applyAttempt(true);
          }
        });
      }
    }

    function snapshot() {
      var current = playback;
      return {
        active: !!current,
        playback: current,
        ratingKey: current && current.ratingKey || '',
        durationSeconds: current ? Number(current.duration || 0) / 1000 : 0,
        positionSeconds: current ? publicTime() : 0,
        offsetBase: current ? Number(current.offsetBase || 0) : 0,
        streamSwitching: playbackSession.streamSwitching(),
        buffering: playbackSession.buffering(),
        nativeSeekPending: playbackSession.nativeSeekPending(),
        decoderSettlementPending: reposition.pending(),
        pendingSeek: pendingSeek,
        timelineSuppressed: timeline.suppressed(),
        recoveryStatus: recovery.status,
        recoveryIndex: recovery.index,
        recoveryAttempts: recovery.attempts,
        localSubtitle: subtitleRuntime.localSnapshot(),
        subtitleRenderMode: subtitleRenderMode(current),
        subtitleEditor: subtitleEditorSnapshot(),
        clockRepairCount: clockRepairCount,
        paused: videoDriver ? !!videoDriver.paused() : true,
        destroyed: playbackSession.destroyed()
      };
    }

    function diagnostics() {
      var current = playback;
      var currentStep = PlaybackRecovery.current(recovery);
      var nativeTime = rawNativeTime();
      var offsetBase = current ? currentOffsetBase() : 0;
      var bufferCheckpoint = playbackSession.bufferCheckpoint();
      var bufferRecovery = playbackSession.bufferRecovery();
      var attempts = [];
      var index;
      for (index = 0; index < recovery.plan.length && index <= recovery.index; index += 1) { attempts.push(recovery.plan[index].kind); }
      return {
        ratingKey: current && current.ratingKey || '',
        playbackMode: current && current.playbackMode || '',
        requestedMode: current && current.requestedPlaybackMode || '',
        delivery: current && current.options && current.options.delivery || '',
        offsetBase: offsetBase,
        position: current ? absoluteTime() : 0,
        nativeCurrentTime: nativeTime,
        nativeAbsoluteTime: nativeTime === null ? null : Math.max(0, offsetBase + nativeTime),
        bufferStartNative: bufferCheckpoint && bufferCheckpoint.nativeTime !== undefined ? bufferCheckpoint.nativeTime : (bufferRecovery && bufferRecovery.bufferStartNative !== undefined ? bufferRecovery.bufferStartNative : null),
        bufferStartPublic: bufferCheckpoint && bufferCheckpoint.absoluteTime !== undefined ? bufferCheckpoint.absoluteTime : (bufferRecovery && bufferRecovery.bufferStartPublic !== undefined ? bufferRecovery.bufferStartPublic : null),
        bufferStartOffsetBase: bufferCheckpoint && bufferCheckpoint.offsetBase !== undefined ? bufferCheckpoint.offsetBase : (bufferRecovery && bufferRecovery.bufferStartOffsetBase !== undefined ? bufferRecovery.bufferStartOffsetBase : null),
        bufferRecoveryAccepted: bufferRecovery && typeof bufferRecovery.accepted === 'boolean' ? bufferRecovery.accepted : null,
        bufferRecoveryReason: bufferRecovery && bufferRecovery.reason || '',
        bufferRecoveryInitialReason: bufferRecovery && bufferRecovery.initialReason || '',
        bufferRecoveryDelta: bufferRecovery && bufferRecovery.delta !== undefined ? bufferRecovery.delta : null,
        bufferRecoveryTarget: bufferRecovery && bufferRecovery.target !== undefined ? bufferRecovery.target : null,
        bufferRecoveryCandidate: bufferRecovery && bufferRecovery.candidate !== undefined ? bufferRecovery.candidate : null,
        buffered: ranges(videoDriver && videoDriver.buffered()),
        sourceUrl: current && current.sourceUrl || '',
        transcodeSession: current && current.transcodeSession || '',
        fallback: recovery.index > 0 && currentStep ? currentStep.kind : '',
        attempts: attempts,
        state: playbackSession.streamSwitching() ? 'loading' : (videoDriver && videoDriver.paused() ? 'paused' : recovery.status || 'playing'),
        buffering: playbackSession.buffering(),
        nativeSeekPending: playbackSession.nativeSeekPending(),
        timelineSuppressed: timeline.suppressed(),
        clockRepairCount: clockRepairCount,
        nativeReadyState: videoDriver ? Number(videoDriver.readyState() || 0) : null,
        nativeNetworkState: videoDriver ? Number(videoDriver.networkState() || 0) : null,
        nativeErrorCode: videoDriver && videoDriver.error() ? Number(videoDriver.error().code || 0) : null
      };
    }

    function unbindEvents() {
      var entry;
      var cleanupError = null;
      while (listeners.length) {
        entry = listeners.pop();
        try {
          if (entry.driver && entry.driver.off) { entry.driver.off(entry.name, entry.handler); }
          else if (entry.target && entry.target.removeEventListener) { entry.target.removeEventListener(entry.name, entry.handler, false); }
        } catch (error) { if (!cleanupError) { cleanupError = error; } }
      }
      try { if (typeof networkUnsubscribe === 'function') { networkUnsubscribe(); } }
      catch (error) { if (!cleanupError) { cleanupError = error; } }
      networkUnsubscribe = null;
      if (cleanupError) { throw cleanupError; }
    }

    function destroy() {
      if (playbackSession.destroyed()) { return; }
      generation += 1;
      closeInternal(true);
      playbackSession.destroy();
      unbindEvents();
    }

    if (!videoDriver || !reposition || !playbackSession || !timeline || !subtitleRuntime) { throw new Error('PlaybackController requires native video, reposition, session, timeline, and subtitle runtime capabilities'); }
    try { bindEvents(); }
    catch (error) {
      // No playback has opened: detach construction-time listeners without
      // running a playback close or disturbing application-owned ASS warming.
      playbackSession.destroy();
      try { unbindEvents(); } catch (_cleanupError) { /* Keep the original binding failure. */ }
      throw error;
    }

    return {
      open: open,
      close: close,
      toggle: toggle,
      seekAbsolute: seekAbsolute,
      changeTrack: changeTrack,
      changeVersion: changeVersion,
      startAdjacent: startAdjacent,
      startItem: startItem,
      openSubtitleEditor: openSubtitleEditor,
      applySubtitleEditor: applySubtitleEditor,
      cancelSubtitleEditor: cancelSubtitleEditor,
      subtitleEditorAvailability: publicSubtitleEditorAvailability,
      snapshot: snapshot,
      diagnostics: diagnostics,
      destroy: destroy
    };
  }

  return { create: create };
}));
