(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffSubtitleEditorSession = factory();
  }
}(this, function () {
  'use strict';

  function copyObject(source) {
    var result = {};
    var key;
    source = source || {};
    for (key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) { result[key] = source[key]; }
    }
    return result;
  }

  function copyBounds(bounds) {
    if (!bounds) { return null; }
    return {
      start: Number(bounds.start || 0),
      end: Number(bounds.end || 0)
    };
  }

  function copyCues(cues) {
    return (cues || []).map(function (cue) {
      return {
        start: Number(cue && cue.start || 0),
        end: Number(cue && cue.end || 0),
        text: String(cue && cue.text || '')
      };
    });
  }

  function copyLocalSubtitleState(source) {
    if (!source) { return null; }
    return {
      rendererType: source.rendererType || null,
      content: String(source.content || ''),
      cues: source.cues ? copyCues(source.cues) : null,
      offsetMs: Number(source.offsetMs || 0),
      streamId: String(source.streamId || ''),
      size: Number(source.size || 100)
    };
  }

  function clampSize(value) {
    return Math.max(50, Math.min(200, Number(value || 100)));
  }

  function open(values) {
    var source = values || {};
    return {
      open: true,
      selectedStreamID: String(source.selectedStreamID || ''),
      subtitleSize: Number(source.subtitleSize || 100),
      offsetMs: Number(source.offsetMs || 0),
      position: Number(source.position || 0),
      paused: source.paused === true,
      loop: source.loop === true,
      bounds: copyBounds(source.bounds),
      applying: false,
      cancelRequested: false,
      finalizing: false,
      status: String(source.status || ''),
      previewMode: String(source.previewMode || 'none'),
      previewError: false,
      previewLoading: false,
      rendererType: null,
      content: '',
      previewWriteError: null,
      previewIdleCallbacks: [],
      previewDebounceTimer: null,
      previewSizeTimer: null,
      previewWriteInFlight: false,
      previewPendingOffset: null,
      previewServerOffsets: {},
      previewOriginalOffsets: {},
      playbackRef: source.playbackRef || null,
      originalOptions: copyObject(source.originalOptions),
      originalLocalSubtitleState: copyLocalSubtitleState(source.originalLocalSubtitleState),
      keepActiveStream: source.keepActiveStream === true,
      cues: []
    };
  }

  function update(state, changes) {
    var source = changes || {};
    if (!state || !state.open) { return false; }
    if (Object.prototype.hasOwnProperty.call(source, 'selectedStreamID')) { state.selectedStreamID = String(source.selectedStreamID || ''); }
    if (Object.prototype.hasOwnProperty.call(source, 'subtitleSize')) { state.subtitleSize = clampSize(source.subtitleSize); }
    if (Object.prototype.hasOwnProperty.call(source, 'offsetMs')) { state.offsetMs = Number(source.offsetMs || 0); }
    if (Object.prototype.hasOwnProperty.call(source, 'position')) { state.position = Number(source.position || 0); }
    if (Object.prototype.hasOwnProperty.call(source, 'paused')) { state.paused = source.paused === true; }
    if (Object.prototype.hasOwnProperty.call(source, 'loop')) { state.loop = source.loop === true; }
    if (Object.prototype.hasOwnProperty.call(source, 'bounds')) { state.bounds = copyBounds(source.bounds); }
    if (Object.prototype.hasOwnProperty.call(source, 'applying')) { state.applying = source.applying === true; }
    if (Object.prototype.hasOwnProperty.call(source, 'cancelRequested')) { state.cancelRequested = source.cancelRequested === true; }
    if (Object.prototype.hasOwnProperty.call(source, 'finalizing')) { state.finalizing = source.finalizing === true; }
    if (Object.prototype.hasOwnProperty.call(source, 'status')) { state.status = String(source.status || ''); }
    if (Object.prototype.hasOwnProperty.call(source, 'previewMode')) { state.previewMode = String(source.previewMode || 'none'); }
    if (Object.prototype.hasOwnProperty.call(source, 'previewError')) { state.previewError = source.previewError === true; }
    if (Object.prototype.hasOwnProperty.call(source, 'previewLoading')) { state.previewLoading = source.previewLoading === true; }
    if (Object.prototype.hasOwnProperty.call(source, 'rendererType')) { state.rendererType = source.rendererType || null; }
    if (Object.prototype.hasOwnProperty.call(source, 'content')) { state.content = String(source.content || ''); }
    if (Object.prototype.hasOwnProperty.call(source, 'previewWriteError')) { state.previewWriteError = source.previewWriteError || null; }
    if (Object.prototype.hasOwnProperty.call(source, 'keepActiveStream')) { state.keepActiveStream = source.keepActiveStream === true; }
    if (Object.prototype.hasOwnProperty.call(source, 'cues')) { state.cues = copyCues(source.cues); }
    return true;
  }

  function snapshot(state) {
    if (!state) { return { open: false }; }
    return {
      open: state.open === true,
      selectedStreamID: String(state.selectedStreamID || ''),
      subtitleSize: Number(state.subtitleSize || 100),
      offsetMs: Number(state.offsetMs || 0),
      position: Number(state.position || 0),
      paused: state.paused === true,
      loop: state.loop === true,
      bounds: copyBounds(state.bounds),
      applying: state.applying === true,
      status: String(state.status || ''),
      previewMode: String(state.previewMode || 'none'),
      previewLoading: state.previewLoading === true,
      previewError: state.previewError === true,
      rendererType: state.rendererType || null
    };
  }

  function commit(state, status) {
    if (!state || !state.open || state.applying) { return false; }
    state.applying = true;
    state.cancelRequested = false;
    state.finalizing = true;
    state.status = String(status || '');
    return true;
  }

  function cancel(state, status) {
    if (!state || !state.open) { return { accepted: false, deferred: false }; }
    state.status = String(status || '');
    if (state.applying) {
      state.cancelRequested = true;
      return { accepted: true, deferred: true };
    }
    state.applying = true;
    state.finalizing = true;
    return { accepted: true, deferred: false };
  }

  return {
    cancel: cancel,
    commit: commit,
    open: open,
    snapshot: snapshot,
    update: update
  };
}));
