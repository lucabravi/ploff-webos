(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffPlaybackController = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var timerRoot = values.root || {};
    var video = values.video;
    var PlexClient = values.PlexClient;
    var PlaybackClock = values.PlaybackClock;
    var PlaybackRecovery = values.PlaybackRecovery;
    var PlaybackStrategy = values.PlaybackStrategy;
    var PlayerSeekController = values.PlayerSeekController;
    var PlayerTimelinePolicy = values.PlayerTimelinePolicy;
    var PlayerBufferingIndicator = values.PlayerBufferingIndicator;
    var SubtitleSync = values.SubtitleSync;
    var SubtitleOffsetStore = values.SubtitleOffsetStore;
    var config = values.config || {};
    var storage = values.storage;
    var playback = null;
    var recovery = PlaybackRecovery.create([]);
    var clock = PlaybackClock.create(2);
    var streamSwitching = false;
    var buffering = false;
    var nativeSeekPending = false;
    var nativeSeekTarget = null;
    var nativeSeekAbsoluteTarget = null;
    var nativeSeekVerificationTimer = null;
    var clockRepairTimer = null;
    var clockRepairFallbackTimer = null;
    var clockRepairGeneration = 0;
    var clockRepairCount = 0;
    var timelineTimer = null;
    var keepaliveTimer = null;
    var resumeTimer = null;
    var recoveryTimer = null;
    var pendingSeek = null;
    var seekTimer = null;
    var estimatedEndTimer = null;
    var timelineSuppressed = false;
    var pendingRestore = null;
    var localSubtitleState = null;
    var localSubtitleRequest = null;
    var localSubtitleGeneration = 0;
    var failedSubtitleStreams = {};
    var subtitleEditorState = null;
    var subtitleEditorRequest = null;
    var subtitleEditorGeneration = 0;
    var subtitlePreviewTimer = null;
    var playbackLoadRequest = null;
    var playbackLoadGeneration = 0;
    var playbackPrepareRequest = null;
    var destroyed = false;
    var generation = 0;
    var listeners = [];
    var networkUnsubscribe = null;
    var visibilityTarget = values.document || null;
    var END_SEEK_GUARD_SECONDS = 2;

    function call(callback, arg1, arg2, arg3, arg4, arg5) {
      if (typeof callback === 'function') { return callback(arg1, arg2, arg3, arg4, arg5); }
      return undefined;
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
      return !destroyed && (!values.isActive || values.isActive() !== false);
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

    function copyLocalSubtitle(source) {
      if (!source) { return null; }
      return { cues: source.cues, offsetMs: source.offsetMs, streamId: source.streamId, size: source.size };
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
    function renderProgress(position, duration) { call(values.renderProgress, position, duration, snapshot()); }
    function renderPlaybackInfo() { call(values.renderPlaybackInfo, playback, snapshot()); }
    function updateEstimatedEnd() { call(values.updateEstimatedEnd, absoluteTime(), playback && Number(playback.duration || 0) / 1000, snapshot()); }
    function notifyState() { call(values.onState, snapshot()); }

    function stopKeepalive() {
      if (keepaliveTimer !== null && timerRoot.clearInterval) { timerRoot.clearInterval(keepaliveTimer); }
      keepaliveTimer = null;
    }

    function startKeepalive() {
      var current = playback;
      stopKeepalive();
      if (!current || !current.transcodeSession || current.options.delivery === 'direct-play') { return; }
      PlexClient.pingTranscode(config, current);
      if (!timerRoot.setInterval) { return; }
      keepaliveTimer = timerRoot.setInterval(function () {
        if (!active() || playback !== current) { stopKeepalive(); return; }
        PlexClient.pingTranscode(config, current);
      }, 30000);
    }

    function stopReporting() {
      if (timelineTimer !== null && timerRoot.clearInterval) { timerRoot.clearInterval(timelineTimer); }
      timelineTimer = null;
      if (estimatedEndTimer !== null && timerRoot.clearInterval) { timerRoot.clearInterval(estimatedEndTimer); }
      estimatedEndTimer = null;
    }

    function startReporting() {
      stopReporting();
      if (!timerRoot.setInterval) { return; }
      timelineTimer = timerRoot.setInterval(function () {
        report(video && video.paused ? 'paused' : 'playing');
      }, 3000);
      estimatedEndTimer = timerRoot.setInterval(updateEstimatedEnd, 10000);
      updateEstimatedEnd();
    }

    function anchorClock(absolute, frozen) {
      if (clockRepairTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(clockRepairTimer); }
      if (clockRepairFallbackTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(clockRepairFallbackTimer); }
      clockRepairTimer = null;
      clockRepairFallbackTimer = null;
      clockRepairGeneration += 1;
      nativeSeekPending = false;
      nativeSeekTarget = null;
      nativeSeekAbsoluteTarget = null;
      if (nativeSeekVerificationTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(nativeSeekVerificationTimer); }
      nativeSeekVerificationTimer = null;
      clock = PlaybackClock.anchor(clock, absolute);
      clock = PlaybackClock.freeze(clock, !!frozen);
    }

    function armNativeSeekVerification(absoluteTarget, nativeTarget) {
      if (nativeSeekVerificationTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(nativeSeekVerificationTimer); }
      nativeSeekTarget = nativeTarget;
      nativeSeekAbsoluteTarget = absoluteTarget;
      if (!timerRoot.setTimeout) { return; }
      nativeSeekVerificationTimer = timerRoot.setTimeout(function () {
        nativeSeekVerificationTimer = null;
        if (!nativeSeekPending || !active() || !playback) { return; }
        nativeSeekPending = false;
        nativeSeekTarget = null;
        nativeSeekAbsoluteTarget = null;
        rebuild(absoluteTarget, false);
      }, 5000);
    }

    function scheduleClockRepair() {
      var repairGeneration;
      if (clockRepairTimer || clockRepairFallbackTimer || buffering || streamSwitching || nativeSeekPending || clockRepairCount >= 1) { return; }
      repairGeneration = clockRepairGeneration;
      if (!timerRoot.setTimeout) { return; }
      clockRepairTimer = timerRoot.setTimeout(function () {
        var observation;
        var target;
        clockRepairTimer = null;
        if (!active() || !playback || buffering || streamSwitching || nativeSeekPending || repairGeneration !== clockRepairGeneration || clockRepairCount >= 1) { return; }
        observation = PlaybackClock.observe(clock, Number(playback.offsetBase || 0), Number(video.currentTime || 0), false);
        clock = observation.state;
        if (!observation.desynced) { return; }
        target = observation.time;
        if (PlayerSeekController.repair({
          directPlay: playback.options.delivery === 'direct-play',
          nativeTime: Number(video.currentTime || 0),
          buffered: ranges(video.buffered)
        }) === 'rebuild') {
          clockRepairCount += 1;
          rebuild(target, false);
        }
      }, 400);
    }

    function absoluteTime() {
      var observation;
      if (!playback) { return 0; }
      if (streamSwitching || buffering || nativeSeekPending) { return PlaybackClock.position(clock); }
      observation = PlaybackClock.observe(clock, Number(playback.offsetBase || 0), Number(video.currentTime || 0), false);
      clock = observation.state;
      if (observation.desynced) { scheduleClockRepair(); }
      return observation.time;
    }

    function displayTime() {
      return pendingSeek === null ? absoluteTime() : pendingSeek;
    }

    function report(stateName, callback) {
      var current = playback;
      var position = absoluteTime();
      if (!PlayerTimelinePolicy.shouldReport({ hasPlayback: !!current, suppressed: timelineSuppressed, position: position })) {
        call(callback, position, false);
        return false;
      }
      PlexClient.sendTimeline(config, current, stateName, position * 1000, callback ? function () { callback(position, true); } : undefined);
      return true;
    }

    function stopBuffering() {
      if (bufferingIndicator) { bufferingIndicator.stop(); }
      if (buffering) {
        buffering = false;
        clock = PlaybackClock.freeze(clock, false);
        setLoading(false);
      }
    }

    var bufferingIndicator = PlayerBufferingIndicator.create({
      root: timerRoot,
      isEligible: function () { return active() && !!playback && !streamSwitching && !nativeSeekPending && video && !video.paused; },
      position: function () { return Number(video && video.currentTime || 0); },
      onShow: function () {
        buffering = true;
        clock = PlaybackClock.freeze(clock, true);
        setLoading(true, true);
        notifyState();
      },
      onHide: function () {
        buffering = false;
        clock = PlaybackClock.freeze(clock, false);
        setLoading(false);
        notifyState();
      }
    });

    function capabilitiesFor(current) {
      var source = call(values.capabilities) || {};
      var capabilities = {
        directPlay: source.directPlay,
        codecs: source.codecs,
        containers: source.containers,
        uhd: source.uhd,
        hdr10: source.hdr10,
        dolbyVision: source.dolbyVision,
        hdrKnown: source.hdrKnown
      };
      var selectedAudio = String(current.options.audioStreamID || '');
      var defaultAudio = '';
      (current.audioTracks || []).forEach(function (track) { if (track.selected) { defaultAudio = String(track.id || ''); } });
      if (current.options.subtitleStreamID || (selectedAudio && defaultAudio && selectedAudio !== defaultAudio)) { capabilities.directPlay = false; }
      return capabilities;
    }

    function planFor(current) {
      return PlaybackStrategy.plan(
        current.requestedPlaybackMode || current.options.playbackMode || 'auto',
        capabilitiesFor(current),
        current.mediaVersions || [],
        current.options.mediaIndex,
        current.requestedVideoQuality || current.options.videoQuality || 'original'
      );
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

    function cancelLocalSubtitleRequest() {
      localSubtitleGeneration += 1;
      if (localSubtitleRequest && localSubtitleRequest.abort) { localSubtitleRequest.abort(); }
      localSubtitleRequest = null;
    }

    function subtitleIdentity() {
      return call(values.subtitleIdentity) || config.apiBaseUrl || 'local';
    }

    function subtitleOffset(track) {
      var classification;
      if (!track || !SubtitleSync) { return 0; }
      classification = SubtitleSync.classify(track);
      if (classification.kind === 'external-text') { return Math.round(Number(track.offset || 0)); }
      if (classification.kind === 'embedded-text' && SubtitleOffsetStore) {
        return SubtitleOffsetStore.get(storage, subtitleIdentity(), playback && playback.partId, track.id);
      }
      return 0;
    }

    function renderSubtitleOverlay() {
      var source = subtitleEditorState && subtitleEditorState.open ? subtitleEditorState : localSubtitleState;
      if (!source || !source.cues) { call(values.hideSubtitleOverlay); return; }
      call(values.renderSubtitleOverlay, source.cues, absoluteTime() * 1000, source.offsetMs, source.size || source.subtitleSize || 100);
    }

    function stopSubtitlePreviewClock() {
      if (subtitlePreviewTimer !== null && timerRoot.clearInterval) { timerRoot.clearInterval(subtitlePreviewTimer); }
      subtitlePreviewTimer = null;
    }

    function startSubtitlePreviewClock() {
      stopSubtitlePreviewClock();
      if (timerRoot.setInterval) { subtitlePreviewTimer = timerRoot.setInterval(renderSubtitleOverlay, 50); }
    }

    function configureLocalSubtitles(current, callback) {
      var track = trackForId(current.subtitleTracks, current.options.subtitleStreamID);
      var classification = SubtitleSync ? SubtitleSync.classify(track) : { kind: 'unsupported' };
      var offset = subtitleOffset(track);
      var requestGeneration;
      cancelLocalSubtitleRequest();
      localSubtitleState = null;
      current.options.localSubtitleOverlay = false;
      if (!track || classification.kind !== 'embedded-text' || offset === 0 || failedSubtitleStreams[track.id]) { call(callback); return; }
      requestGeneration = localSubtitleGeneration;
      var requestCompleted = false;
      var request = PlexClient.loadSubtitleText(config, current, track, function (error, text) {
        var cues;
        requestCompleted = true;
        if (requestGeneration !== localSubtitleGeneration || current !== playback || destroyed) { return; }
        localSubtitleRequest = null;
        cues = error || !SubtitleSync ? [] : SubtitleSync.parse(text);
        if (error || !cues.length) {
          failedSubtitleStreams[track.id] = true;
          current.options.localSubtitleOverlay = false;
          call(values.onError, error || new Error('subtitle preview unavailable'));
        } else {
          current.options.localSubtitleOverlay = true;
          localSubtitleState = { cues: cues, offsetMs: offset, streamId: track.id, size: current.options.subtitleSize || 100 };
        }
        call(callback);
      });
      if (!requestCompleted) { localSubtitleRequest = request; }
    }

    function applyAttempt(preserveFrame) {
      var step = PlaybackRecovery.current(recovery);
      var position = Math.max(0, Number(recovery.position || 0));
      var current = playback;
      var attemptGeneration = generation;
      var attemptSession;
      var prepareRequest;
      var prepareCompleted = false;
      if (!current || !step || !active()) { call(values.showError, false, retry); return; }
      recovery = PlaybackRecovery.start(recovery, position);
      applyVersion(current, step);
      current.options.delivery = step.kind === 'direct-play' ? 'direct-play' : step.kind;
      current.options.mediaIndex = step.mediaIndex;
      current.options.partIndex = step.partIndex;
      current.options.videoQuality = step.videoQuality;
      current.options.videoResolution = step.videoResolution;
      current.options.playbackMode = step.kind === 'transcode' || step.kind === 'safe-transcode' ? 'transcode' : 'auto';
      current.options.offset = step.kind === 'direct-play' ? 0 : position;
      current.offsetBase = step.kind === 'direct-play' ? 0 : position;
      current.directSeekTarget = step.kind === 'direct-play' ? position : null;
      stopKeepalive();
      PlexClient.rotateTranscodeSession(current);
      attemptSession = current.transcodeSession;
      stopBuffering();
      streamSwitching = true;
      buffering = false;
      anchorClock(position, true);
      call(values.hideError);
      setStatus('preparing');
      setLoading(true, !!preserveFrame);
      cancelPlaybackPrepareRequest();
      prepareRequest = PlexClient.preparePlayback(config, current, current.options, function (error, sourceUrl) {
        prepareCompleted = true;
        if (playbackPrepareRequest === prepareRequest) { playbackPrepareRequest = null; }
        if (!active() || playback !== current || attemptGeneration !== generation || current.transcodeSession !== attemptSession) { return; }
        if (error || !sourceUrl || directOnlyViolation(current)) { recover(error); return; }
        current.sourceUrl = sourceUrl;
        current.hlsUrl = sourceUrl;
        startKeepalive();
        renderPlaybackInfo();
        video.pause();
        video.src = sourceUrl;
        video.load();
        notifyState();
      });
      if (!prepareCompleted && active() && playback === current && attemptGeneration === generation && current.transcodeSession === attemptSession) {
        playbackPrepareRequest = prepareRequest || null;
      } else if (!prepareCompleted && prepareRequest && prepareRequest.abort) {
        prepareRequest.abort();
      }
    }

    function recover(error) {
      var position = !playback ? 0 : (streamSwitching ? Number(recovery.position || 0) : absoluteTime());
      var offline = call(values.isOffline) === true || timerRoot.navigator && timerRoot.navigator.onLine === false;
      if (recoveryTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(recoveryTimer); }
      recoveryTimer = null;
      if (error) { call(values.onError, error); }
      if (!playback || !recovery.plan.length) {
        streamSwitching = false;
        call(values.showError, false, retry);
        notifyState();
        return;
      }
      recovery = PlaybackRecovery.fail(recovery, offline, position);
      if (recovery.status === 'waiting-network') {
        streamSwitching = false;
        call(values.showError, true, retry);
        notifyState();
        return;
      }
      if (recovery.status === 'failed') {
        streamSwitching = false;
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

    function resumeRebuiltStream() {
      if (resumeTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(resumeTimer); }
      if (!timerRoot.setTimeout) { return; }
      resumeTimer = timerRoot.setTimeout(function () {
        if (!active() || !video || video.readyState < 2) { return; }
        if (pendingRestore && pendingRestore.paused) {
          streamSwitching = false;
          buffering = false;
          clock = PlaybackClock.freeze(clock, false);
          video.pause();
          setLoading(false);
          setStatus('paused');
          pendingRestore = null;
          timelineSuppressed = false;
          startReporting();
          renderProgress(absoluteTime(), playback && Number(playback.duration || 0) / 1000);
          notifyState();
          return;
        }
        streamSwitching = false;
        try { video.play(); } catch (error) { return; }
        resumeTimer = timerRoot.setTimeout(function () {
          if (active() && video.paused && video.readyState >= 2) {
            try { video.play(); } catch (error) { return; }
          }
        }, 250);
      }, 120);
    }

    function rebuild(absolute, updateSelection) {
      var current = playback;
      var target;
      var recoveryStep;
      var transcodeSession;
      var rebuildGeneration = generation;
      var prepareRequest;
      var prepareCompleted = false;
      function failPrepare(error, status) {
        streamSwitching = false;
        clock = PlaybackClock.freeze(clock, false);
        setLoading(false);
        setStatus(status || 'stream-error');
        if (error) { call(values.onError, error); }
        if (pendingRestore) {
          pendingRestore = null;
          timelineSuppressed = false;
          startReporting();
        }
      }
      function applySource(sourceUrl) {
        if (!active() || playback !== current || current.transcodeSession !== transcodeSession || rebuildGeneration !== generation) { return; }
        try {
          current.sourceUrl = sourceUrl;
          current.hlsUrl = sourceUrl;
          startKeepalive();
          renderPlaybackInfo();
          video.pause();
          current.offsetBase = target;
          video.src = sourceUrl;
          video.load();
          notifyState();
        } catch (error) { failPrepare(error, 'stream-error'); }
      }
      function prepareSource() {
        cancelPlaybackPrepareRequest();
        prepareRequest = PlexClient.preparePlayback(config, current, current.options, function (error, sourceUrl) {
          prepareCompleted = true;
          if (playbackPrepareRequest === prepareRequest) { playbackPrepareRequest = null; }
          if (!active() || playback !== current || current.transcodeSession !== transcodeSession || rebuildGeneration !== generation) { return; }
          if (error || !sourceUrl) { failPrepare(error, 'stream-error'); recover(error); return; }
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
      recoveryStep = PlaybackRecovery.current(recovery);
      if (recoveryStep && recoveryStep.kind === 'direct-play') {
        recovery = PlaybackRecovery.rebuild(recovery, target);
        applyAttempt(false);
        return true;
      }
      recovery = PlaybackRecovery.rebuild(recovery, target);
      current.options.offset = target;
      pendingSeek = null;
      if (seekTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(seekTimer); }
      seekTimer = null;
      report('stopped');
      stopBuffering();
      streamSwitching = true;
      buffering = false;
      anchorClock(target, true);
      stopKeepalive();
      PlexClient.rotateTranscodeSession(current);
      transcodeSession = current.transcodeSession;
      setStatus('preparing');
      setLoading(true, false);
      if (!updateSelection) { prepareSource(); return true; }
      PlexClient.setStreamSelection(config, current, current.options, function (selectionError) {
        if (!active() || playback !== current || current.transcodeSession !== transcodeSession || rebuildGeneration !== generation) { return; }
        if (selectionError) { failPrepare(selectionError, 'track-error'); return; }
        prepareSource();
      });
      return true;
    }

    function commitSeek(options) {
      var decision;
      var target;
      var forceRebuild = options && options.forceRebuild;
      if (pendingSeek === null || !playback || !active()) { return; }
      if (streamSwitching) {
        target = pendingSeek;
        pendingSeek = null;
        seekTimer = null;
        rebuild(target, false);
        return;
      }
      target = pendingSeek;
      pendingSeek = null;
      seekTimer = null;
      decision = PlayerSeekController.decide({
        target: target,
        duration: Number(playback.duration || 0) / 1000,
        nativeDuration: video.duration,
        offset: Number(playback.offsetBase || 0),
        buffered: ranges(video.buffered),
        seekable: ranges(video.seekable),
        directPlay: playback.options.delivery === 'direct-play',
        forceRebuild: forceRebuild === true
      });
      if (!decision) { return; }
      if (decision.operation === 'rebuild') { rebuild(decision.target, false); return; }
      anchorClock(decision.target, false);
      nativeSeekPending = true;
      armNativeSeekVerification(decision.target, decision.nativeTime);
      try { video.currentTime = decision.nativeTime; }
      catch (error) {
        nativeSeekPending = false;
        nativeSeekTarget = null;
        nativeSeekAbsoluteTarget = null;
        if (nativeSeekVerificationTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(nativeSeekVerificationTimer); }
        nativeSeekVerificationTimer = null;
        rebuild(decision.target, false);
        return;
      }
      renderProgress(displayTime(), Number(playback.duration || 0) / 1000);
      updateEstimatedEnd();
      report(video.paused ? 'paused' : 'playing');
      notifyState();
    }

    function seekAbsolute(seconds, options) {
      var duration;
      var target;
      options = options || {};
      if (!playback || !isFinite(Number(seconds))) { return false; }
      duration = Number(playback.duration || 0) / 1000;
      if (!isFinite(duration) || duration <= 0) { return false; }
      target = Math.max(0, Math.min(duration, Number(seconds)));
      if (duration > END_SEEK_GUARD_SECONDS && target > duration - END_SEEK_GUARD_SECONDS) {
        target = duration - END_SEEK_GUARD_SECONDS;
      }
      pendingSeek = target;
      if (seekTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(seekTimer); }
      if (options.immediate || !timerRoot.setTimeout) { commitSeek(options); }
      else { seekTimer = timerRoot.setTimeout(function () { commitSeek(options); }, 250); }
      renderProgress(displayTime(), duration);
      updateEstimatedEnd();
      return true;
    }

    function toggle() {
      if (!video || !playback) { return false; }
      if (video.paused) { video.play(); }
      else { video.pause(); }
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
          recovery = PlaybackRecovery.create(planFor(current));
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
          recovery = PlaybackRecovery.create(planFor(current));
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
        if (version.subtitleSize !== undefined) { current.options.subtitleSize = Number(version.subtitleSize); }
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
        recovery = PlaybackRecovery.create(planFor(current));
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

    function subtitleEditorSnapshot() {
      var source = subtitleEditorState;
      if (!source) { return { open: false }; }
      return {
        open: source.open,
        selectedStreamID: source.selectedStreamID,
        subtitleSize: source.subtitleSize,
        offsetMs: source.offsetMs,
        position: source.position,
        paused: source.paused,
        loop: source.loop,
        bounds: source.bounds,
        applying: source.applying,
        status: source.status,
        previewMode: source.previewMode
      };
    }

    function subtitleEditorPreviewPosition(stateValue) {
      return stateValue && stateValue.loop && stateValue.bounds ? stateValue.bounds.start : absoluteTime();
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

    function rebuildExternalPreview(stateValue, streamId) {
      if (destroyed || !subtitleEditorState || subtitleEditorState !== stateValue || stateValue.finalizing ||
          stateValue.previewMode !== 'server' || String(stateValue.selectedStreamID || '') !== String(streamId || '')) { return; }
      rebuild(subtitleEditorPreviewPosition(stateValue), false);
    }

    function queuePreviewSize(stateValue) {
      if (!stateValue || stateValue.previewMode !== 'server') { return; }
      if (stateValue.previewSizeTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(stateValue.previewSizeTimer); }
      if (!timerRoot.setTimeout) { rebuild(subtitleEditorPreviewPosition(stateValue), false); return; }
      stateValue.previewSizeTimer = timerRoot.setTimeout(function () {
        stateValue.previewSizeTimer = null;
        if (destroyed || !subtitleEditorState || subtitleEditorState !== stateValue || stateValue.finalizing) { drainPreviewWaiters(stateValue); return; }
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
        stateValue.previewWriteInFlight = false;
        if (error) {
          stateValue.previewWriteError = error;
          if (subtitleEditorState === stateValue && !destroyed) {
            stateValue.status = translate('status.trackError');
            call(values.onSubtitleEditorState, subtitleEditorSnapshot());
          }
        } else {
          stateValue.previewServerOffsets[pending.streamId] = pending.offsetMs;
        }
        if (stateValue.previewPendingOffset) { flushExternalOffset(stateValue); return; }
        if (!error) { rebuildExternalPreview(stateValue, pending.streamId); }
        drainPreviewWaiters(stateValue);
      });
    }

    function queueExternalOffset(stateValue, track) {
      if (!stateValue || !track) { return; }
      rememberPreviewOffset(stateValue, track);
      stateValue.previewWriteError = null;
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
          var current = playback || stateValue.playbackRef;
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

    function loadEditorTrack(stateValue, preserveStream, callback) {
      var track = trackForId(playback && playback.subtitleTracks, stateValue.selectedStreamID);
      var classification = SubtitleSync ? SubtitleSync.classify(track) : { kind: 'unsupported' };
      var editorGeneration;
      if (subtitleEditorRequest && subtitleEditorRequest.abort) { subtitleEditorRequest.abort(); }
      subtitleEditorRequest = null;
      subtitleEditorGeneration += 1;
      editorGeneration = subtitleEditorGeneration;
      stateValue.cues = [];
      stateValue.previewError = false;
      stateValue.offsetMs = track && Object.prototype.hasOwnProperty.call(stateValue.previewServerOffsets, String(track.id || ''))
        ? stateValue.previewServerOffsets[String(track.id || '')]
        : subtitleOffset(track);
      stateValue.previewMode = classification.kind === 'external-text' ? 'server' :
        (classification.kind === 'embedded-text' ? 'overlay' : 'none');
      if (!track) {
        stopSubtitlePreviewClock();
        call(values.hideSubtitleOverlay);
        stateValue.status = '';
        playback.options.subtitleStreamID = '';
        playback.options.localSubtitleOverlay = false;
        call(values.onSubtitleEditorState, subtitleEditorSnapshot());
        call(callback, null, stateValue);
        if (!preserveStream) { rebuild(subtitleEditorPreviewPosition(stateValue), false); }
        return;
      }
      if (classification.kind === 'external-text') {
        rememberPreviewOffset(stateValue, track);
        stopSubtitlePreviewClock();
        call(values.hideSubtitleOverlay);
        stateValue.status = '';
        playback.options.subtitleStreamID = String(track.id || '');
        playback.options.localSubtitleOverlay = false;
        call(values.onSubtitleEditorState, subtitleEditorSnapshot());
        call(callback, null, stateValue);
        if (!preserveStream) { rebuild(subtitleEditorPreviewPosition(stateValue), true); }
        return;
      }
      if (classification.kind !== 'embedded-text') {
        stateValue.previewError = true;
        stateValue.status = translate('player.subtitlePreviewFailed');
        call(values.onSubtitleEditorState, subtitleEditorSnapshot());
        call(callback, new Error('subtitle unsupported'), stateValue);
        return;
      }
      startSubtitlePreviewClock();
      playback.options.subtitleStreamID = '';
      playback.options.localSubtitleOverlay = false;
      stateValue.status = translate('player.subtitlePreviewLoading');
      call(values.onSubtitleEditorState, subtitleEditorSnapshot());
      var editorRequestCompleted = false;
      var editorRequest = PlexClient.loadSubtitleText(config, playback, track, function (error, text) {
        var cues;
        editorRequestCompleted = true;
        if (destroyed || !subtitleEditorState || subtitleEditorState !== stateValue || editorGeneration !== subtitleEditorGeneration ||
            String(stateValue.selectedStreamID || '') !== String(track.id || '')) { return; }
        subtitleEditorRequest = null;
        cues = error || !SubtitleSync ? [] : SubtitleSync.parse(text);
        if (error || !cues.length) {
          failedSubtitleStreams[track.id] = true;
          stateValue.previewError = true;
          stateValue.status = translate('player.subtitlePreviewFailed');
          stateValue.cues = [];
          call(values.onError, error || new Error('subtitle preview unavailable'));
        } else {
          stateValue.status = '';
          stateValue.cues = cues;
        }
        renderSubtitleOverlay();
        call(values.onSubtitleEditorState, subtitleEditorSnapshot());
        call(callback, error || null, stateValue);
      });
      if (!editorRequestCompleted) { subtitleEditorRequest = editorRequest; }
      if (!preserveStream) { rebuild(subtitleEditorPreviewPosition(stateValue), false); }
    }

    function openSubtitleEditor(options) {
      var availability;
      var current = playback;
      var action;
      var target;
      var track;
      var captured;
      var originalLocal;
      options = options || {};
      action = options.action || 'open';
      if (action !== 'open') {
        if (!subtitleEditorState || !subtitleEditorState.open || subtitleEditorState.finalizing) { return false; }
        if (action === 'set-track') {
          subtitleEditorState.selectedStreamID = String(options.streamId || '');
          loadEditorTrack(subtitleEditorState, false, function () { call(values.onSubtitleEditorState, subtitleEditorSnapshot()); });
        } else if (action === 'set-size') {
          subtitleEditorState.subtitleSize = Math.max(50, Math.min(200, Number(options.size || 100)));
          if (playback) { playback.options.subtitleSize = subtitleEditorState.subtitleSize; }
          renderSubtitleOverlay();
          queuePreviewSize(subtitleEditorState);
        } else if (action === 'adjust-offset') {
          subtitleEditorState.offsetMs = SubtitleSync.adjust(subtitleEditorState.offsetMs, Number(options.delta || 0));
          track = trackForId(playback && playback.subtitleTracks, subtitleEditorState.selectedStreamID);
          if (track && subtitleEditorState.previewMode === 'server') { queueExternalOffset(subtitleEditorState, track); }
          renderSubtitleOverlay();
        } else if (action === 'seek') {
          target = Math.max(0, Math.min(Number(playback && playback.duration || 0) / 1000, absoluteTime() + Number(options.delta || 0)));
          subtitleEditorState.bounds = { start: target, end: Math.min(Number(playback.duration || 0) / 1000, target + 5) };
          seekAbsolute(target, { source: 'subtitle-editor' });
        } else if (action === 'toggle-loop') {
          subtitleEditorState.loop = !subtitleEditorState.loop;
        }
        call(values.onSubtitleEditorState, subtitleEditorSnapshot());
        return true;
      }
      if (!current || !SubtitleSync || subtitleEditorState && subtitleEditorState.open) { return false; }
      availability = SubtitleSync.availability(current.options.subtitleStreamID, current.subtitleTracks || [], failedSubtitleStreams);
      if (!availability.enabled) { call(values.onSubtitleUnavailable, availability); return false; }
      captured = absoluteTime();
      timelineSuppressed = true;
      stopReporting();
      originalLocal = copyLocalSubtitle(localSubtitleState);
      localSubtitleState = null;
      subtitleEditorState = {
        open: true,
        selectedStreamID: String(current.options.subtitleStreamID || ''),
        subtitleSize: Number(current.options.subtitleSize || 100),
        offsetMs: 0,
        position: captured,
        paused: !!video.paused,
        loop: false,
        bounds: SubtitleSync.loopBounds(captured, Number(current.duration || 0) / 1000),
        applying: false,
        cancelRequested: false,
        finalizing: false,
        status: '',
        previewMode: 'none',
        previewError: false,
        previewWriteError: null,
        previewIdleCallbacks: [],
        previewDebounceTimer: null,
        previewSizeTimer: null,
        previewWriteInFlight: false,
        previewPendingOffset: null,
        previewServerOffsets: {},
        previewOriginalOffsets: {},
        playbackRef: current,
        originalOptions: copyObject(current.options),
        originalLocalSubtitleState: originalLocal,
        cues: []
      };
      current.options = copyObject(subtitleEditorState.originalOptions);
      current.options.localSubtitleOverlay = false;
      loadEditorTrack(subtitleEditorState, true, function () { call(values.onSubtitleEditorState, subtitleEditorSnapshot()); });
      if (subtitleEditorState.previewMode !== 'server') {
        current.options.subtitleStreamID = '';
        rebuild(subtitleEditorState.bounds.start, false);
      }
      call(values.onSubtitleEditorState, subtitleEditorSnapshot());
      return true;
    }

    function finishSubtitleRestore(stateValue, options, localState, callback) {
      if (!playback || !stateValue) { call(callback, new Error('playback unavailable')); return; }
      stopSubtitlePreviewClock();
      if (stateValue.previewSizeTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(stateValue.previewSizeTimer); }
      if (subtitleEditorRequest && subtitleEditorRequest.abort) { subtitleEditorRequest.abort(); }
      subtitleEditorRequest = null;
      subtitleEditorState = null;
      playback.options = options;
      localSubtitleState = localState;
      call(values.hideSubtitleOverlay);
      pendingRestore = { paused: stateValue.paused };
      rebuild(stateValue.position, false);
      resetSubtitlePreviewWrites(stateValue);
      call(values.onSubtitleEditorState, { open: false });
      call(callback, null, snapshot());
    }

    function restoreCancelledSubtitleApply(stateValue, callback) {
      function restoreSelection() {
        if (destroyed || !subtitleEditorState || subtitleEditorState !== stateValue || !playback) { return; }
        PlexClient.setStreamSelection(config, playback, stateValue.originalOptions, function (error) {
          if (destroyed || !subtitleEditorState || subtitleEditorState !== stateValue) { return; }
          if (error) {
            stateValue.applying = false;
            stateValue.finalizing = false;
            stateValue.status = translate('status.trackError');
            call(values.onSubtitleEditorState, subtitleEditorSnapshot());
            call(callback, error);
            return;
          }
          finishSubtitleRestore(stateValue, copyObject(stateValue.originalOptions), stateValue.originalLocalSubtitleState, callback);
        });
      }
      stateValue.finalizing = true;
      restorePreviewOffsets(stateValue, '', function () { restoreSelection(); });
    }

    function failSubtitleApply(stateValue, error, restoreSelection, callback) {
      function finish(selectionError) {
        if (destroyed || !subtitleEditorState || subtitleEditorState !== stateValue) { return; }
        stateValue.applying = false;
        stateValue.finalizing = false;
        stateValue.status = translate('status.trackError');
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
      options = options || {};
      if (!stateValue || !stateValue.open || stateValue.applying || !current) { call(callback, new Error('subtitle editor closed')); return false; }
      track = trackForId(current.subtitleTracks, stateValue.selectedStreamID);
      if (track && stateValue.previewMode === 'overlay' && stateValue.previewError) {
        stateValue.status = translate('player.subtitlePreviewFailed');
        call(values.onSubtitleEditorState, subtitleEditorSnapshot());
        call(callback, new Error('subtitle preview unavailable'));
        return false;
      }
      if (track && stateValue.previewMode === 'overlay' && (!stateValue.cues.length || subtitleEditorRequest)) {
        stateValue.status = translate('player.subtitlePreviewLoading');
        call(values.onSubtitleEditorState, subtitleEditorSnapshot());
        call(callback, new Error('subtitle preview loading'));
        return false;
      }
      nextOptions = copyObject(stateValue.originalOptions);
      nextOptions.subtitleStreamID = stateValue.selectedStreamID;
      nextOptions.subtitleSize = stateValue.subtitleSize;
      classification = SubtitleSync ? SubtitleSync.classify(track) : { kind: 'unsupported' };
      stateValue.applying = true;
      stateValue.cancelRequested = false;
      stateValue.finalizing = true;
      stateValue.status = translate('status.preparing');
      call(values.onSubtitleEditorState, subtitleEditorSnapshot());
      restorePreviewOffsets(stateValue, track && classification.kind === 'external-text' ? track.id : '', function (offsetError) {
        if (destroyed || !subtitleEditorState || subtitleEditorState !== stateValue) { return; }
        if (stateValue.cancelRequested) { restoreCancelledSubtitleApply(stateValue, callback); return; }
        if (offsetError || stateValue.previewWriteError) { failSubtitleApply(stateValue, offsetError || stateValue.previewWriteError, false, callback); return; }
        PlexClient.setStreamSelection(config, current, nextOptions, function (selectionError) {
          var stored = true;
          var localState = null;
          if (destroyed || !subtitleEditorState || subtitleEditorState !== stateValue || playback !== current) { return; }
          if (stateValue.cancelRequested) { restoreCancelledSubtitleApply(stateValue, callback); return; }
          if (selectionError) { failSubtitleApply(stateValue, selectionError, false, callback); return; }
          if (track && classification.kind === 'external-text') { track.offset = stateValue.offsetMs; }
          if (track && classification.kind === 'embedded-text' && stateValue.offsetMs !== 0) {
            stored = SubtitleOffsetStore.set(storage, subtitleIdentity(), current.partId, track.id, stateValue.offsetMs);
            nextOptions.localSubtitleOverlay = true;
            localState = { cues: stateValue.cues, offsetMs: stateValue.offsetMs, streamId: track.id, size: stateValue.subtitleSize };
          } else {
            nextOptions.localSubtitleOverlay = false;
            if (track && classification.kind === 'embedded-text') { stored = SubtitleOffsetStore.remove(storage, subtitleIdentity(), current.partId, track.id); }
          }
          if (!stored) { failSubtitleApply(stateValue, new Error('subtitle offset storage failed'), true, callback); return; }
          finishSubtitleRestore(stateValue, nextOptions, localState, callback);
        });
      });
      return true;
    }

    function cancelSubtitleEditor(callback) {
      var stateValue = subtitleEditorState;
      if (!stateValue || !stateValue.open || !playback) { call(callback, null, snapshot()); return false; }
      if (stateValue.applying) {
        stateValue.cancelRequested = true;
        stateValue.status = translate('status.preparing');
        call(values.onSubtitleEditorState, subtitleEditorSnapshot());
        return true;
      }
      stateValue.applying = true;
      stateValue.finalizing = true;
      stateValue.status = translate('status.preparing');
      call(values.onSubtitleEditorState, subtitleEditorSnapshot());
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
      request = request || {};
      detail = request.detail || request.item || null;
      ratingKey = detail && detail.ratingKey;
      if (destroyed || !ratingKey) { call(callback, new Error('playback item unavailable')); return false; }
      if (playback) { report('stopped'); }
      generation += 1;
      openGeneration = generation;
      closeInternal(true);
      loadGeneration = playbackLoadGeneration;
      failedSubtitleStreams = {};
      call(values.onOpening, request);
      setStatus('preparing');
      streamSwitching = true;
      setLoading(true);
      session = request.session || 'ploff-' + new Date().getTime();
      startOffset = request.startOffset;
      loadRequest = PlexClient.loadPlayback(config, ratingKey, session, request.preferences || call(values.playbackPreferences, request) || {}, function (error, loaded) {
        var resolvedStart;
        loadCompleted = true;
        if (playbackLoadRequest === loadRequest) { playbackLoadRequest = null; }
        if (destroyed || openGeneration !== generation || loadGeneration !== playbackLoadGeneration || !active()) { return; }
        if (error || !loaded) {
          streamSwitching = false;
          setStatus('stream-error');
          call(values.onError, error || new Error('playback unavailable'));
          call(values.showError, false, retry);
          call(callback, error || new Error('playback unavailable'));
          return;
        }
        playback = loaded;
        resolvedStart = startOffset === null || startOffset === undefined ? Math.max(0, Number(loaded.resumePosition || 0)) : Math.max(0, Number(startOffset || 0));
        playback.resumePosition = resolvedStart;
        playback.options.offset = resolvedStart;
        playback.offsetBase = resolvedStart;
        playback.requestedPlaybackMode = loaded.options.playbackMode || 'auto';
        playback.requestedVideoQuality = loaded.options.videoQuality || 'original';
        clockRepairCount = 0;
        anchorClock(resolvedStart, true);
        configureLocalSubtitles(playback, function () {
          if (destroyed || openGeneration !== generation || playback !== loaded) { return; }
          recovery = PlaybackRecovery.create(planFor(loaded));
          recovery.position = resolvedStart;
          video.autoplay = true;
          call(values.onPlaybackLoaded, loaded, request, snapshot());
          startReporting();
          applyAttempt(false);
          call(callback, null, snapshot());
        });
      });
      if (!loadCompleted && !destroyed && openGeneration === generation && loadGeneration === playbackLoadGeneration) { playbackLoadRequest = loadRequest || null; }
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
        if (destroyed || requestGeneration !== generation || loadGeneration !== playbackLoadGeneration) { return; }
        if (error || !detail) { call(callback, error || new Error('metadata unavailable')); return; }
        options.item = item;
        options.detail = detail;
        open(options, callback);
      });
      if (!loadCompleted && !destroyed && requestGeneration === generation && loadGeneration === playbackLoadGeneration) {
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
        if (destroyed || requestGeneration !== generation) { return; }
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

    function closeInternal(clearSource) {
      var closingEditor = subtitleEditorState;
      cancelPlaybackLoadRequest();
      cancelPlaybackPrepareRequest();
      stopBuffering();
      stopKeepalive();
      stopReporting();
      stopSubtitlePreviewClock();
      cancelLocalSubtitleRequest();
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
      pendingRestore = null;
      timelineSuppressed = false;
      localSubtitleState = null;
      if (closingEditor) {
        closingEditor.open = false;
        closingEditor.finalizing = true;
        restorePreviewOffsets(closingEditor, '', function () { resetSubtitlePreviewWrites(closingEditor); });
      }
      subtitleEditorState = null;
      subtitleEditorGeneration += 1;
      if (subtitleEditorRequest && subtitleEditorRequest.abort) { subtitleEditorRequest.abort(); }
      subtitleEditorRequest = null;
      streamSwitching = false;
      buffering = false;
      nativeSeekPending = false;
      nativeSeekTarget = null;
      nativeSeekAbsoluteTarget = null;
      recovery = PlaybackRecovery.create([]);
      clock = PlaybackClock.create(2);
      clockRepairCount = 0;
      if (clearSource && video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
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
      position = absoluteTime();
      reported = PlayerTimelinePolicy.shouldReport({ hasPlayback: true, suppressed: timelineSuppressed, position: position });
      if (reported) {
        PlexClient.sendTimeline(config, current, 'stopped', position * 1000, function () {
          if (!destroyed) { call(values.onClosed, position, true, ratingKey); }
        });
      } else {
        call(values.onClosed, position, false, ratingKey);
      }
      closeInternal(true);
      call(callback, position, reported, ratingKey);
      return true;
    }

    function onPlaying() {
      if (!active() || !playback) { return; }
      stopBuffering();
      if (resumeTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(resumeTimer); }
      resumeTimer = null;
      streamSwitching = false;
      buffering = false;
      clock = PlaybackClock.freeze(clock, false);
      recovery = PlaybackRecovery.playing(recovery);
      call(values.hideError);
      startKeepalive();
      if (!nativeSeekPending) { setLoading(false); }
      setStatus('playing');
      if (pendingRestore) {
        pendingRestore = null;
        timelineSuppressed = false;
        startReporting();
      }
      report('playing');
      renderProgress(displayTime(), Number(playback.duration || 0) / 1000);
      renderSubtitleOverlay();
      notifyState();
    }

    function onCanPlay() {
      var directTarget;
      if (!active() || !playback) { return; }
      stopBuffering();
      if (playback.directSeekTarget !== null && playback.directSeekTarget !== undefined) {
        directTarget = Number(playback.directSeekTarget || 0);
        if (directTarget > 0.25) {
          nativeSeekPending = true;
          armNativeSeekVerification(directTarget, directTarget);
          try { video.currentTime = directTarget; }
          catch (error) {
            nativeSeekPending = false;
            nativeSeekTarget = null;
            nativeSeekAbsoluteTarget = null;
            if (nativeSeekVerificationTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(nativeSeekVerificationTimer); }
            nativeSeekVerificationTimer = null;
            recover(error);
            return;
          }
        }
        playback.directSeekTarget = null;
      }
      if (streamSwitching) { resumeRebuiltStream(); }
      else if (video.paused) { video.play(); }
    }

    function onWaiting() {
      if (!active() || !playback || streamSwitching || video.paused) { return; }
      bufferingIndicator.signal();
    }

    function onSeeking() {
      if (!active() || !playback) { return; }
      clock = PlaybackClock.freeze(clock, true);
    }

    function onSeeked() {
      var observation;
      var expected = nativeSeekPending;
      var expectedNative = nativeSeekTarget;
      var expectedAbsolute = nativeSeekAbsoluteTarget;
      if (!active() || !playback) { return; }
      if (clockRepairFallbackTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(clockRepairFallbackTimer); }
      if (nativeSeekVerificationTimer !== null && timerRoot.clearTimeout) { timerRoot.clearTimeout(nativeSeekVerificationTimer); }
      clockRepairFallbackTimer = null;
      nativeSeekVerificationTimer = null;
      nativeSeekPending = false;
      nativeSeekTarget = null;
      nativeSeekAbsoluteTarget = null;
      if (expected && expectedNative !== null && !PlayerSeekController.reached(expectedNative, video.currentTime)) {
        rebuild(expectedAbsolute !== null ? expectedAbsolute : Number(playback.offsetBase || 0) + Number(expectedNative || 0), false);
        return;
      }
      if (!streamSwitching && !buffering) {
        clock = PlaybackClock.freeze(clock, false);
        observation = PlaybackClock.observe(clock, Number(playback.offsetBase || 0), Number(video.currentTime || 0), expected);
        clock = observation.state;
        if (observation.desynced) { scheduleClockRepair(); }
        setLoading(false);
        renderProgress(displayTime(), Number(playback.duration || 0) / 1000);
      }
      notifyState();
    }

    function onPause() {
      stopBuffering();
      if (streamSwitching || !active() || !playback) { return; }
      buffering = false;
      clock = PlaybackClock.freeze(clock, false);
      setLoading(false);
      setStatus('paused');
      report('paused');
      renderProgress(displayTime(), Number(playback.duration || 0) / 1000);
      notifyState();
    }

    function onTimeUpdate() {
      if (!playback) { return; }
      renderProgress(displayTime(), Number(playback.duration || 0) / 1000);
      if (subtitleEditorState && subtitleEditorState.open && subtitleEditorState.loop &&
          absoluteTime() >= subtitleEditorState.bounds.end - 0.05 && !streamSwitching) {
        seekAbsolute(subtitleEditorState.bounds.start, { immediate: true, source: 'subtitle-loop' });
      }
      renderSubtitleOverlay();
      notifyState();
    }

    function onEnded() {
      if (streamSwitching || !playback) { return; }
      report('stopped');
      setStatus('ended');
      call(values.onEnded, snapshot());
    }

    function onError() {
      if (!active()) { return; }
      setStatus('playback-error');
      recover(video && video.error || new Error('native playback error'));
    }

    function bind(target, name, handler) {
      if (!target || !target.addEventListener) { return; }
      target.addEventListener(name, handler, false);
      listeners.push({ target: target, name: name, handler: handler });
    }

    function bindEvents() {
      bind(video, 'playing', onPlaying);
      bind(video, 'canplay', onCanPlay);
      bind(video, 'waiting', onWaiting);
      bind(video, 'stalled', onWaiting);
      bind(video, 'seeking', onSeeking);
      bind(video, 'seeked', onSeeked);
      bind(video, 'pause', onPause);
      bind(video, 'timeupdate', onTimeUpdate);
      bind(video, 'ended', onEnded);
      bind(video, 'error', onError);
      if (visibilityTarget) {
        bind(visibilityTarget, 'visibilitychange', function () {
          if (visibilityTarget.hidden) { stopReporting(); }
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
        positionSeconds: current ? displayTime() : 0,
        offsetBase: current ? Number(current.offsetBase || 0) : 0,
        streamSwitching: streamSwitching,
        buffering: buffering,
        nativeSeekPending: nativeSeekPending,
        pendingSeek: pendingSeek,
        timelineSuppressed: timelineSuppressed,
        recoveryStatus: recovery.status,
        recoveryIndex: recovery.index,
        recoveryAttempts: recovery.attempts,
        localSubtitle: copyLocalSubtitle(localSubtitleState),
        subtitleEditor: subtitleEditorSnapshot(),
        clockRepairCount: clockRepairCount,
        paused: video ? !!video.paused : true,
        destroyed: destroyed
      };
    }

    function diagnostics() {
      var current = playback;
      var currentStep = PlaybackRecovery.current(recovery);
      var attempts = [];
      var index;
      for (index = 0; index < recovery.plan.length && index <= recovery.index; index += 1) { attempts.push(recovery.plan[index].kind); }
      return {
        ratingKey: current && current.ratingKey || '',
        playbackMode: current && current.playbackMode || '',
        requestedMode: current && current.requestedPlaybackMode || '',
        delivery: current && current.options && current.options.delivery || '',
        offsetBase: current && Number(current.offsetBase || 0) || 0,
        position: current ? absoluteTime() : 0,
        buffered: ranges(video && video.buffered),
        sourceUrl: current && current.sourceUrl || '',
        transcodeSession: current && current.transcodeSession || '',
        fallback: recovery.index > 0 && currentStep ? currentStep.kind : '',
        attempts: attempts,
        state: streamSwitching ? 'loading' : (video && video.paused ? 'paused' : recovery.status || 'playing'),
        buffering: buffering,
        nativeSeekPending: nativeSeekPending,
        timelineSuppressed: timelineSuppressed,
        clockRepairCount: clockRepairCount
      };
    }

    function destroy() {
      var entry;
      if (destroyed) { return; }
      destroyed = true;
      generation += 1;
      closeInternal(true);
      while (listeners.length) {
        entry = listeners.pop();
        if (entry.target && entry.target.removeEventListener) { entry.target.removeEventListener(entry.name, entry.handler, false); }
      }
      if (typeof networkUnsubscribe === 'function') { networkUnsubscribe(); }
      networkUnsubscribe = null;
    }

    if (!video) { throw new Error('PlaybackController requires a native video element'); }
    bindEvents();

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
      snapshot: snapshot,
      diagnostics: diagnostics,
      destroy: destroy
    };
  }

  return { create: create };
}));
