(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffSubtitleRuntime = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var SubtitleSync = values.SubtitleSync;
    var SubtitleOffsetStore = values.SubtitleOffsetStore;
    var AssSubtitleRenderer = values.AssSubtitleRenderer;
    var localState = null;
    var failedStreams = {};
    var assRenderer = null;
    var assRendererStreamId = '';
    var assRendererContent = '';
    var assClockOffsetMs = null;
    var seekPresentation = null;

    function call(callback, arg1, arg2, arg3, arg4) {
      if (typeof callback === 'function') { return callback(arg1, arg2, arg3, arg4); }
      return undefined;
    }

    function copyLocal(source, includeContent) {
      /** @type {{cues: any, rendererType: any, offsetMs: number, streamId: any, size: any, content?: any}} */
      var result;
      if (!source) { return null; }
      result = {
        cues: source.cues || null,
        rendererType: source.rendererType,
        offsetMs: Number(source.offsetMs || 0),
        streamId: source.streamId,
        size: source.size
      };
      if (includeContent) { result.content = source.content; }
      return result;
    }

    function isLocalKind(classification) {
      var kind = classification && classification.kind;
      return kind === 'external-text' || kind === 'embedded-text' || kind === 'external-ass' || kind === 'embedded-ass';
    }

    function isAssKind(classification) {
      var kind = classification && classification.kind;
      return kind === 'external-ass' || kind === 'embedded-ass';
    }

    function renderingEnabled(classification) {
      var settings = call(values.subtitleRendering) || {};
      if (!classification) { return false; }
      if (isAssKind(classification)) { return settings.ass === true; }
      if (classification.kind === 'external-text' || classification.kind === 'embedded-text') { return settings.srt === true; }
      return false;
    }

    function failed(streamId) {
      return failedStreams[String(streamId || '')] === true;
    }

    function markFailed(streamId) {
      var id = String(streamId || '');
      if (id) { failedStreams[id] = true; }
    }

    function clearFailed(streamId) {
      delete failedStreams[String(streamId || '')];
    }

    function resetFailures() { failedStreams = {}; }

    function editorTrackAllowed(current, track) {
      var classification;
      if (!track || !SubtitleSync) { return false; }
      classification = SubtitleSync.classify(track);
      if (!classification.supported || !classification.editorSupported) { return false; }
      if (failed(track.id) && !isAssKind(classification)) { return false; }
      return true;
    }

    function editorAvailability(current, streamId) {
      var explicitStream = arguments.length > 1;
      var selectedId;
      var tracks;
      var selected;
      var index;
      if (!current || !SubtitleSync) { return { enabled: false, reason: 'unsupported' }; }
      selectedId = explicitStream ? String(streamId || '') : String(current.options && current.options.subtitleStreamID || '');
      tracks = current.subtitleTracks || [];
      if (selectedId || explicitStream) {
        selected = SubtitleSync.trackById ? SubtitleSync.trackById(tracks, selectedId) : null;
        if (editorTrackAllowed(current, selected)) { return { enabled: true, reason: '' }; }
        if (selected && SubtitleSync.classify(selected).editorSupported && failed(selected.id)) {
          return { enabled: false, reason: 'failed' };
        }
        return { enabled: false, reason: 'unsupported' };
      }
      for (index = 0; index < tracks.length; index += 1) {
        if (editorTrackAllowed(current, tracks[index])) { return { enabled: true, reason: '' }; }
      }
      return { enabled: false, reason: 'unsupported' };
    }

    function offset(current, track) {
      var classification;
      var presentation;
      if (!track || !SubtitleSync) { return 0; }
      presentation = call(values.subtitlePresentation, current, track);
      if (presentation) { return Math.round(Number(presentation.offsetMs || 0)); }
      classification = SubtitleSync.classify(track);
      if (classification.kind === 'external-text' || classification.kind === 'external-ass') { return Math.round(Number(track.offset || 0)); }
      if ((classification.kind === 'embedded-text' || classification.kind === 'embedded-ass') && SubtitleOffsetStore) {
        return SubtitleOffsetStore.get(values.storage, call(values.subtitleIdentity) || 'local', current && current.partId, track.id);
      }
      return 0;
    }

    function setLocal(source) {
      localState = copyLocal(source, true);
      if (localState && localState.rendererType === 'ass' && assRenderer && typeof assRenderer.setSize === 'function') {
        assRenderer.setSize(localState.size || 100);
      }
      return localState;
    }

    function clearLocal() { localState = null; }
    function localStateCopy() { return copyLocal(localState, true); }
    function localSnapshot() { return copyLocal(localState, false); }
    function setLocalSize(size) {
      if (!localState) { return; }
      localState.size = size;
      if (localState.rendererType === 'ass' && assRenderer && typeof assRenderer.setSize === 'function') { assRenderer.setSize(size); }
    }

    function setAssSize(size) {
      if (assRenderer && typeof assRenderer.setSize === 'function') { assRenderer.setSize(size); }
    }

    function ensureAss() {
      if (assRenderer || !AssSubtitleRenderer || typeof AssSubtitleRenderer.create !== 'function') { return assRenderer; }
      assRenderer = AssSubtitleRenderer.create({
        root: values.root || {},
        document: values.document || null,
        videoDimensions: values.videoDimensions,
        canvasId: 'ass-subtitle-overlay',
        onRuntimeError: values.onAssRuntimeError
      });
      return assRenderer;
    }

    function disposeAss() {
      if (assRenderer && typeof assRenderer.dispose === 'function') { assRenderer.dispose(); }
      assRenderer = null;
      assRendererStreamId = '';
      assRendererContent = '';
      assClockOffsetMs = null;
    }

    function syncAssOffset(offsetMs, assTime) {
      var normalized = Math.round(Number(offsetMs || 0));
      var shifted = Math.max(0, Number(assTime) || 0);
      if (assClockOffsetMs !== null && normalized !== assClockOffsetMs && assRenderer && typeof assRenderer.discontinuity === 'function') {
        assRenderer.discontinuity(shifted);
      }
      assClockOffsetMs = normalized;
    }

    function loadAss(track, content, callback) {
      var renderer;
      var streamId = String(track && track.id || '');
      var source = String(content || '');
      try { renderer = ensureAss(); }
      catch (error) { call(callback, error); return; }
      if (!renderer || typeof renderer.load !== 'function') { call(callback, new Error('ASS subtitle renderer unavailable')); return; }
      if (assRendererStreamId === streamId && assRendererContent === source) { call(callback, null, renderer); return; }
      renderer.load(source, function (error) {
        if (!error) {
          assRendererStreamId = streamId;
          assRendererContent = source;
          assClockOffsetMs = null;
        }
        call(callback, error || null, renderer);
      });
    }

    function hide() {
      if (assRenderer && typeof assRenderer.hide === 'function') { assRenderer.hide(); }
      call(values.hideText);
    }

    function beginSeekPresentation(waitForPlaying, targetSeconds) {
      var target = Number(targetSeconds);
      // The native element can expose an optimistic seek target before LG webOS
      // settles on the decoded keyframe. Keep subtitle pixels hidden until the
      // controller proves the post-seek native clock and releases this gate.
      seekPresentation = {
        waitForPlaying: waitForPlaying === true,
        target: isFinite(target) ? target : null
      };
      hide();
    }

    function markSeekRebuffer() {
      if (!seekPresentation) { return; }
      seekPresentation.waitForPlaying = true;
      hide();
    }

    function markSeekPlaying() {
      if (seekPresentation) { seekPresentation.waitForPlaying = false; }
    }

    function seekPresentationPending() { return seekPresentation !== null; }
    function seekPresentationWaitingForPlaying() { return !!(seekPresentation && seekPresentation.waitForPlaying); }
    function seekPresentationTarget() { return seekPresentation ? seekPresentation.target : null; }
    function releaseSeekPresentation() { seekPresentation = null; }
    function resetSeekPresentation() { seekPresentation = null; }

    function syncAssClock(absoluteSeconds, paused, editorState) {
      var source = editorState && editorState.open ? editorState : localState;
      var seconds;
      var assTime;
      var offsetMs;
      if (!source || source.rendererType !== 'ass' || !assRenderer || typeof assRenderer.setTime !== 'function') { return; }
      seconds = Math.max(0, Number(absoluteSeconds || 0));
      offsetMs = Number(source.offsetMs || 0);
      assTime = seconds - offsetMs / 1000;
      syncAssOffset(offsetMs, assTime);
      if (assTime < 0) {
        if (typeof assRenderer.hide === 'function') { assRenderer.hide(); }
        return;
      }
      assRenderer.setTime(assTime, paused === true);
    }

    function discontinuity(absoluteSeconds, previewState) {
      var source = previewState || localState;
      var seconds;
      var assTime;
      if (!source || source.rendererType !== 'ass' || !assRenderer || typeof assRenderer.discontinuity !== 'function') { return false; }
      if (absoluteSeconds === undefined || absoluteSeconds === null || !isFinite(Number(absoluteSeconds))) {
        assRenderer.discontinuity();
        return true;
      }
      seconds = Math.max(0, Number(absoluteSeconds));
      assTime = Math.max(0, seconds - Number(source.offsetMs || 0) / 1000);
      assRenderer.discontinuity(assTime);
      return true;
    }

    function render(editorState, absoluteSeconds, paused) {
      var source = editorState && editorState.open ? editorState : localState;
      var seconds = Math.max(0, Number(absoluteSeconds || 0));
      var assTime;
      var offsetMs;
      if (!source) { hide(); return; }
      if (source.rendererType === 'ass') {
        call(values.hideText);
        if (assRenderer) {
          offsetMs = Number(source.offsetMs || 0);
          assTime = seconds - offsetMs / 1000;
          syncAssOffset(offsetMs, assTime);
          if (assTime < 0) {
            if (typeof assRenderer.hide === 'function') { assRenderer.hide(); }
          } else {
            if (typeof assRenderer.setTime === 'function') { assRenderer.setTime(assTime, paused === true); }
            if (typeof assRenderer.show === 'function') { assRenderer.show(); }
          }
        }
        return;
      }
      if (assRenderer && typeof assRenderer.hide === 'function') { assRenderer.hide(); }
      if (!source.cues) { call(values.hideText); return; }
      call(values.renderText, source.cues, seconds * 1000, source.offsetMs, source.size || source.subtitleSize || 100);
    }

    function reset() {
      hide();
      disposeAss();
      localState = null;
      failedStreams = {};
      seekPresentation = null;
    }

    return {
      isLocalKind: isLocalKind,
      isAssKind: isAssKind,
      renderingEnabled: renderingEnabled,
      editorTrackAllowed: editorTrackAllowed,
      editorAvailability: editorAvailability,
      failed: failed,
      markFailed: markFailed,
      clearFailed: clearFailed,
      resetFailures: resetFailures,
      offset: offset,
      setLocal: setLocal,
      clearLocal: clearLocal,
      localState: localStateCopy,
      localSnapshot: localSnapshot,
      setLocalSize: setLocalSize,
      setAssSize: setAssSize,
      syncAssClock: syncAssClock,
      discontinuity: discontinuity,
      loadAss: loadAss,
      disposeAss: disposeAss,
      render: render,
      hide: hide,
      beginSeekPresentation: beginSeekPresentation,
      markSeekRebuffer: markSeekRebuffer,
      markSeekPlaying: markSeekPlaying,
      seekPresentationPending: seekPresentationPending,
      seekPresentationWaitingForPlaying: seekPresentationWaitingForPlaying,
      seekPresentationTarget: seekPresentationTarget,
      releaseSeekPresentation: releaseSeekPresentation,
      resetSeekPresentation: resetSeekPresentation,
      reset: reset
    };
  }

  return { create: create };
}));
