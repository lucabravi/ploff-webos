(function (root, factory) {
  'use strict';
  var api;
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else {
    api = factory();
    root.PloffStartupMetrics = api;
    var warmTest = false;
    try { warmTest = root.localStorage.getItem('ploff.assWarmTest') === '1'; } catch (ignore) {}
    var refresh = warmTest ? function () { api.refreshWarmTestPanel(root); } : null;
    root.PloffAssSubtitleColdStartMetrics = api.createAssColdStartMetrics({ root: root, warmTest: warmTest, onChange: refresh });
    root.PloffAssSubtitleWorkerPreloader = api.createAssWorkerPreloader({ root: root, metrics: root.PloffAssSubtitleColdStartMetrics, onChange: refresh });
    if (api.assRenderingEnabledAtStartup(root)) { root.PloffAssSubtitleWorkerPreloader.start(); }
    if (refresh && root.document && root.document.addEventListener) { root.document.addEventListener('DOMContentLoaded', refresh); }
  }
}(this, function () {
  'use strict';

  var ASS_LEGACY_WORKER_URL = 'vendor/subtitles-octopus-worker-legacy.js?v=4.1.0-os-mem1&assTiming=1&assSync=12&assWarm=4';
  var ASS_FALLBACK_FONT_URL = 'default.ttf?v=4.1.0-os';
  var ASS_WARMUP_WIDTH = 1920;
  var ASS_WARMUP_HEIGHT = 1080;
  var ASS_WARMUP_CONTENT = '[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,20,20,30,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
  var ASS_WARMUP_TEXT = ["abcdefghijklmnopqrstuvwxyz àèéìòù çñü","ABCDEFGHIJKLMNOPQRSTUVWXYZ ÀÈÉÌÒÙ ÇÑÜ","0123456789 .,;:!? \"'()[] -–—… €£¥° ©®","{\\b1}Ploff ABC abc 0123 àèéìòù","{\\i1}Ploff ABC abc 0123 àèéìòù","{\\fs36}Ploff ABC abc 0123 àèéìòù","{\\fs36\\bord3\\shad1}abcdefghijklmnopqrstuvwxyz\\NABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789"];
  ASS_WARMUP_CONTENT += ASS_WARMUP_TEXT.map(function (text, index) {
    return 'Dialogue: 0,0:00:0' + index + '.00,0:00:0' + (index + 1) + '.00,Default,,0,0,0,,' + text + '\n';
  }).join('');
  var ASS_SETTINGS_KEYS = ['ploff.settings.v3', 'ploff.settings.v2', 'ploff.settings.v1'];

  function refreshWarmTestPanel(root) {
    var doc = root.document;
    var metrics = root.PloffAssSubtitleColdStartMetrics;
    var preloader = root.PloffAssSubtitleWorkerPreloader;
    var panel;
    var m;
    var p;
    var first;
    function seconds(value) { return typeof value === 'number' && isFinite(value) ? (value / 1000).toFixed(2) + 's' : '--'; }
    function delta(end, start) { return m[end] !== null && m[start] !== null ? seconds(m[end] - m[start]) : '--'; }
    if (!doc || !doc.body || !metrics || !preloader) { return; }
    p = preloader.snapshot();
    if (!p.started) { return; }
    m = metrics.snapshot(); first = metrics.firstRenderProfile();
    panel = doc.getElementById('ass-warm-test');
    if (!panel) {
      panel = doc.createElement('pre'); panel.id = 'ass-warm-test';
      panel.style.cssText = 'position:fixed;left:24px;top:24px;z-index:2147483647;pointer-events:none;background:rgba(0,0,0,.85);color:#fff;font:20px/1.35 monospace;padding:12px;margin:0;white-space:pre;';
      doc.body.appendChild(panel);
    }
    panel.textContent = 'ASS TEST 100% | tempi da avvio app\n' +
      'Font pronto @' + seconds(m.fontReady) + ' | libass pronto @' + seconds(m.libassRuntimeReady) + '\n' +
      'Warm iniziato @' + seconds(p.warmStartedAt) + ' | completo: ' + (p.warmComplete ? 'SI' : 'NO') + '\n' +
      'Step libass / RGBA / canvas\n' + p.warmSteps.map(function (step) {
        return step.index + ': ' + seconds(step.libassMs) + ' / ' + seconds(step.blendMs) + ' / ' + seconds(step.drawMs);
      }).join('\n') + '\n' +
      'ASS download ' + delta('realAssFetchEnd', 'realAssFetchStart') + ' | setTrack ' + delta('realAssSetTrackReady', 'realAssSetTrackStart') + '\n' +
      'Primo frame reale: libass ' + seconds(first.libassMs) + ' | RGBA ' + seconds(first.blendMs) + '\n' +
      'Primo disegno @' + seconds(first.presentedAt) + ' | attesa presentazione ' + seconds(first.rafMs);
  }

  function assRenderingEnabledAtStartup(root) {
    var storage = root && root.localStorage;
    var index;
    var raw;
    var parsed;
    if (!storage || typeof storage.getItem !== 'function') { return false; }
    for (index = 0; index < ASS_SETTINGS_KEYS.length; index += 1) {
      try {
        raw = storage.getItem(ASS_SETTINGS_KEYS[index]);
        if (!raw) { continue; }
        parsed = JSON.parse(raw);
        return !!parsed && parsed.subtitleRenderingAss === true;
      } catch (_error) { return false; }
    }
    return false;
  }

  var NAMES = {
    'bootstrap': 'bootstrap',
    'composition-ready': 'compositionReady',
    'server-ready': 'serverReady',
    'first-home-content': 'firstHomeContent',
    'first-focusable-ui': 'firstFocusableUi',
    'player-load-start': 'playerLoadStart',
    'player-code-ready': 'playerCodeReady',
    'player-feature-ready': 'playerFeatureReady'
  };


  var ASS_METRIC_NAMES = [
    'workerRequested', 'workerCreated', 'staticMemoryReady', 'workerInitSent', 'workerInitReceived',
    'fontRequested', 'fontReady', 'libassRuntimeReady', 'warmTrackReady', 'warmFirstFrame',
    'realAssFetchStart', 'realAssFetchEnd', 'realAssSetTrackStart', 'realAssSetTrackReady', 'firstRealAssFrame'
  ];
  var ASS_WORKER_METRICS = {
    'static-memory-end': 'staticMemoryReady',
    'worker-init-received': 'workerInitReceived',
    'font-request': 'fontRequested',
    'font-loaded': 'fontReady',
    'libass-runtime-ready': 'libassRuntimeReady',
    'warm-track-ready': 'warmTrackReady'
  };

  function createAssColdStartMetrics(options) {
    var values = options || {};
    var root = values.root || {};
    var now = typeof values.now === 'function' ? values.now : function () {
      if (root.performance && typeof root.performance.now === 'function') { return root.performance.now(); }
      return new Date().getTime();
    };
    var origin = Number(now()) || 0;
    var lastElapsed = 0;
    var marks = {};
    var firstRender = {};
    var debugCapture = values.debugCapture || null;
    var syncCaptureGeneration = 0;
    var syncSummary = {
      sampleCount: 0, inputDriftMs: 0, maxInputDriftMs: 0,
      firstFrameLagMs: null, frameLagMs: null, maxFrameLagMs: 0,
      maxRenderMs: 0, maxTransportMs: 0, maxRafMs: 0
    };
    var ASS_SYNC_FIELDS = {
      'controller': ['nativeTime', 'publicTime', 'subtitleTime', 'nativeTrusted', 'paused'],
      'renderer': ['requestedTime', 'paused', 'frameReleasePending'],
      'worker-send': ['requestedTime', 'paused'],
      'worker-frame': ['mediaTime', 'clockAnchor', 'clockAgeMs', 'renderMs', 'libassMs', 'blendMs',
        'bitmapCount', 'pixelCount', 'renderCount', 'changedRenderCount', 'frameSeq', 'frameFingerprint',
        'libassTotalMs', 'blendTotalMs', 'syncUpdateCount', 'syncTriggeredRenderCount', 'pauseTransitionCount',
        'syncQueueMs', 'maxSyncQueueMs', 'maxLibassMs', 'maxBlendMs', 'slowRenderCount', 'slowLibassRenderCount',
        'slowUnchangedRenderCount', 'maxUnchangedLibassMs', 'lastSlowUnchangedLibassMs', 'lastSlowUnchangedMediaTime',
        'lastSlowUnchangedClockAgeMs', 'lastSlowUnchangedReason', 'workerWarmStepCount', 'workerWarmTotalMs',
        'workerWarmMaxMs', 'workerWarmLastMs', 'workerWarmComplete', 'trackAnimated', 'effectiveTargetFps',
        'playbackEpoch', 'renderGeneration', 'prepared', 'lookaheadStarted', 'lookaheadCompleted', 'recentRenderMs', 'workerPreparedDepth', 'workerPreparedCostlyDepth', 'boundaryIndex', 'validFrom', 'validUntil', 'workerPaused', 'frameSuppressed', 'renderReason'],
      'raf-presented': ['mediaTime', 'clockAnchor', 'clockAgeMs', 'expectedTime', 'renderMs', 'libassMs', 'blendMs',
        'bitmapCount', 'pixelCount', 'renderCount', 'changedRenderCount', 'frameSeq', 'frameFingerprint',
        'libassTotalMs', 'blendTotalMs', 'syncUpdateCount', 'syncTriggeredRenderCount', 'pauseTransitionCount',
        'syncQueueMs', 'maxSyncQueueMs', 'maxLibassMs', 'maxBlendMs', 'slowRenderCount', 'slowLibassRenderCount',
        'slowUnchangedRenderCount', 'maxUnchangedLibassMs', 'lastSlowUnchangedLibassMs', 'lastSlowUnchangedMediaTime',
        'lastSlowUnchangedClockAgeMs', 'lastSlowUnchangedReason', 'workerWarmStepCount', 'workerWarmTotalMs',
        'workerWarmMaxMs', 'workerWarmLastMs', 'workerWarmComplete', 'trackAnimated', 'effectiveTargetFps',
        'playbackEpoch', 'renderGeneration', 'prepared', 'lookaheadStarted', 'lookaheadCompleted', 'recentRenderMs', 'workerPreparedDepth', 'workerPreparedCostlyDepth', 'boundaryIndex', 'validFrom', 'validUntil', 'renderReason', 'transportMs', 'rafMs', 'paused', 'workerPaused'],
      'frame-rejected': ['mediaTime', 'expectedTime', 'playbackEpoch', 'renderGeneration', 'boundaryIndex', 'validFrom', 'validUntil', 'reason'],
      'prepared-frame': ['mediaTime', 'expectedTime', 'playbackEpoch', 'renderGeneration', 'boundaryIndex', 'validFrom', 'validUntil', 'preparedDepth', 'preparedCostlyDepth', 'preparedBytes', 'leadMs', 'reason'],
      'prepared-presented': ['mediaTime', 'expectedTime', 'playbackEpoch', 'renderGeneration', 'boundaryIndex', 'validFrom', 'validUntil', 'preparedDepth', 'preparedCostlyDepth', 'preparedBytes', 'leadMs', 'reason'],
      'prepared-dropped': ['mediaTime', 'expectedTime', 'playbackEpoch', 'renderGeneration', 'boundaryIndex', 'validFrom', 'validUntil', 'preparedDepth', 'preparedCostlyDepth', 'preparedBytes', 'leadMs', 'reason'],
      'prepared-invalidated': ['mediaTime', 'expectedTime', 'playbackEpoch', 'renderGeneration', 'boundaryIndex', 'validFrom', 'validUntil', 'preparedDepth', 'preparedCostlyDepth', 'preparedBytes', 'leadMs', 'reason']
    };

    function has(name) { return Object.prototype.hasOwnProperty.call(marks, name); }
    function elapsed() {
      lastElapsed = Math.max(lastElapsed, Math.max(0, (Number(now()) || origin) - origin));
      return lastElapsed;
    }
    function mark(name) {
      name = String(name || '');
      if (ASS_METRIC_NAMES.indexOf(name) === -1) { return null; }
      if (!has(name)) { marks[name] = elapsed(); if (values.onChange) { values.onChange(); } }
      return marks[name];
    }
    function begin(start, end) {
      if (has(end)) { return marks[start]; }
      marks[start] = elapsed();
      return marks[start];
    }
    function finish(start, end) {
      if (!has(start)) { begin(start, end); }
      return mark(end);
    }
    function beginRealAssFetch() { return begin('realAssFetchStart', 'realAssFetchEnd'); }
    function endRealAssFetch() { return finish('realAssFetchStart', 'realAssFetchEnd'); }
    function beginRealAssSetTrack() { return begin('realAssSetTrackStart', 'realAssSetTrackReady'); }
    function endRealAssSetTrack() { return finish('realAssSetTrackStart', 'realAssSetTrackReady'); }
    function recordWorkerTiming(phase) {
      var metricName;
      phase = String(phase || '');
      metricName = ASS_WORKER_METRICS[phase];
      if (metricName) { return mark(metricName); }
      if (phase === 'set-track-start') { return beginRealAssSetTrack(); }
      if (phase === 'set-track-end') { return endRealAssSetTrack(); }
      if (phase === 'first-render-message') { return mark(has('realAssSetTrackStart') ? 'firstRealAssFrame' : 'warmFirstFrame'); }
      return null;
    }
    function captureRef() { return debugCapture || root.PloffDebugCapture || null; }
    function captureActive() {
      var capture = captureRef();
      return !!(capture && typeof capture.isActive === 'function' && capture.isActive());
    }
    function resetSyncSummary() {
      syncSummary = {
        sampleCount: 0, inputDriftMs: 0, maxInputDriftMs: 0,
        firstFrameLagMs: null, frameLagMs: null, maxFrameLagMs: 0,
        maxRenderMs: 0, maxTransportMs: 0, maxRafMs: 0
      };
    }
    function recordAssSync(stage, sample) {
      var fields = ASS_SYNC_FIELDS[String(stage || '')];
      var capture;
      var status;
      var entry;
      var index;
      var name;
      var value;
      var lagMs;
      var driftMs;
      if (values.warmTest && sample && sample.bitmapCount > 0 && (stage === 'worker-frame' || stage === 'raf-presented')) {
        if (stage === 'worker-frame' && firstRender.libassMs === undefined) {
          firstRender.libassMs = sample.libassMs; firstRender.blendMs = sample.blendMs;
          if (values.onChange) { values.onChange(); }
        }
        if (stage === 'raf-presented' && firstRender.presentedAt === undefined) {
          firstRender.presentedAt = elapsed(); firstRender.rafMs = sample.rafMs;
          if (values.onChange) { values.onChange(); }
        }
      }
      if (!fields) { return false; }
      if (!captureActive()) { return values.warmTest === true && firstRender.presentedAt === undefined; }
      capture = captureRef();
      if (!capture || typeof capture.record !== 'function') { return false; }
      status = typeof capture.status === 'function' ? capture.status() : null;
      if (!status) { return false; }
      if (syncCaptureGeneration !== Number(status.generation || 0)) {
        syncCaptureGeneration = Number(status.generation || 0);
        resetSyncSummary();
      }
      sample = sample || {};
      entry = {};
      for (index = 0; index < fields.length; index += 1) {
        name = fields[index];
        if (!Object.prototype.hasOwnProperty.call(sample, name)) { continue; }
        if (name === 'paused' || name === 'workerPaused' || name === 'frameReleasePending' || name === 'nativeTrusted' ||
            name === 'frameSuppressed' || name === 'workerWarmComplete' || name === 'trackAnimated' || name === 'prepared') {
          if (sample[name] === true || sample[name] === false) { entry[name] = sample[name]; }
        } else if (name === 'renderReason' || name === 'lastSlowUnchangedReason' || name === 'reason') {
          value = String(sample[name] || '');
          if (['set-track', 'sync', 'resume', 'resize', 'style', 'track', 'loop', 'boundary', 'lookahead', 'epoch', 'generation', 'backward-time', 'backward-boundary', 'expired-window', 'future-window', 'expired', 'depth', 'budget', 'superseded', 'suppressed', 'dispose'].indexOf(value) !== -1) { entry[name] = value; }
        } else if (name === 'frameFingerprint') {
          value = String(sample[name] || '').toLowerCase();
          if (/^[0-9a-f]{8}$/.test(value)) { entry[name] = value; }
        } else if (sample[name] === null && (name === 'validFrom' || name === 'validUntil' || name === 'boundaryIndex')) {
          entry[name] = null;
        } else {
          value = Number(sample[name]);
          if (isFinite(value)) { entry[name] = value; }
        }
      }
      if (!capture.record('ass', String(stage || ''), entry)) { return false; }
      syncSummary.sampleCount += 1;
      if (stage === 'controller' && isFinite(Number(sample.subtitleTime)) && isFinite(Number(sample.nativeTime))) {
        driftMs = Math.round((Number(sample.subtitleTime) - Number(sample.nativeTime)) * 1000);
        syncSummary.inputDriftMs = driftMs;
        syncSummary.maxInputDriftMs = Math.max(syncSummary.maxInputDriftMs, Math.abs(driftMs));
      }
      if (stage === 'raf-presented' && isFinite(Number(sample.expectedTime)) && isFinite(Number(sample.mediaTime))) {
        lagMs = Math.round((Number(sample.expectedTime) - Number(sample.mediaTime)) * 1000);
        if (syncSummary.firstFrameLagMs === null) { syncSummary.firstFrameLagMs = lagMs; }
        syncSummary.frameLagMs = lagMs;
        syncSummary.maxFrameLagMs = Math.max(syncSummary.maxFrameLagMs, Math.abs(lagMs));
        syncSummary.maxRenderMs = Math.max(syncSummary.maxRenderMs, Math.max(0, Number(sample.renderMs || 0)));
        syncSummary.maxTransportMs = Math.max(syncSummary.maxTransportMs, Math.max(0, Number(sample.transportMs || 0)));
        syncSummary.maxRafMs = Math.max(syncSummary.maxRafMs, Math.max(0, Number(sample.rafMs || 0)));
      }
      return true;
    }
    function syncTraceSnapshot() {
      var capture = captureRef();
      var snapshot;
      if (!capture || typeof capture.export !== 'function') { return []; }
      snapshot = capture.export();
      return (snapshot.events || []).filter(function (entry) { return entry.category === 'ass'; }).map(function (entry) {
        var copy = { atMs: entry.atMs, stage: entry.event };
        var key;
        for (key in entry) {
          if (Object.prototype.hasOwnProperty.call(entry, key) && ['seq', 'atMs', 'category', 'event'].indexOf(key) === -1) { copy[key] = entry[key]; }
        }
        return copy;
      });
    }
    function snapshot() {
      var result = {};
      var index;
      var name;
      for (index = 0; index < ASS_METRIC_NAMES.length; index += 1) {
        name = ASS_METRIC_NAMES[index];
        result[name] = has(name) ? marks[name] : null;
      }
      if (syncSummary.sampleCount > 0 && captureActive()) {
        result.sync = {
          sampleCount: syncSummary.sampleCount,
          inputDriftMs: syncSummary.inputDriftMs,
          maxInputDriftMs: syncSummary.maxInputDriftMs,
          firstFrameLagMs: syncSummary.firstFrameLagMs,
          frameLagMs: syncSummary.frameLagMs,
          maxFrameLagMs: syncSummary.maxFrameLagMs,
          maxRenderMs: syncSummary.maxRenderMs,
          maxTransportMs: syncSummary.maxTransportMs,
          maxRafMs: syncSummary.maxRafMs
        };
      }
      return result;
    }
    return {
      beginRealAssFetch: beginRealAssFetch, endRealAssFetch: endRealAssFetch,
      beginRealAssSetTrack: beginRealAssSetTrack, endRealAssSetTrack: endRealAssSetTrack,
      mark: mark, recordWorkerTiming: recordWorkerTiming, recordAssSync: recordAssSync,
      firstRenderProfile: function () { return { libassMs: firstRender.libassMs, blendMs: firstRender.blendMs, presentedAt: firstRender.presentedAt, rafMs: firstRender.rafMs }; },
      elapsed: elapsed,
      syncTrace: syncTraceSnapshot, snapshot: snapshot
    };
  }

  function supportsWebAssembly(root) {
    var api = root && root.WebAssembly;
    var Bytes = root && root.Uint8Array || (typeof Uint8Array !== 'undefined' ? Uint8Array : null);
    var module;
    if (!api || typeof api !== 'object' || typeof api.instantiate !== 'function' ||
        typeof api.Module !== 'function' || typeof api.Instance !== 'function' || !Bytes) { return false; }
    try {
      module = new api.Module(new Bytes([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
      return module instanceof api.Module && new api.Instance(module) instanceof api.Instance;
    } catch (ignore) { return false; }
  }

  function createAssWorkerPreloader(options) {
    var values = options || {};
    var root = values.root || {};
    var metrics = values.metrics || null;
    var WorkerConstructor = values.Worker || root.Worker;
    var workerUrl = String(values.workerUrl || ASS_LEGACY_WORKER_URL);
    var warmupContent = String(values.warmupContent || ASS_WARMUP_CONTENT);
    var fallbackFont = String(values.fallbackFont || ASS_FALLBACK_FONT_URL);
    var warmupWidth = Math.max(1, Number(values.warmupWidth || ASS_WARMUP_WIDTH));
    var warmupHeight = Math.max(1, Number(values.warmupHeight || ASS_WARMUP_HEIGHT));
    var now = typeof values.now === 'function' ? values.now : function () {
      if (root.performance && typeof root.performance.now === 'function') { return root.performance.now(); }
      return new Date().getTime();
    };
    var worker = null;
    var started = false;
    var failed = false;
    var requestedAt = null;
    var initSentAt = null;
    var workerReadyAt = null;
    var firstFrameAt = null;
    var takenAt = null;
    var warmStepCount = 0;
    var warmTotalMs = 0;
    var warmMaxMs = 0;
    var warmComplete = false;
    var warmStarted = false;
    var warmStartedAt = null;
    var warmTimer = null;
    var warmIndex = 0;
    var warmSteps = [];
    var warmCanvas = null;
    var warmBuffer = null;
    var warmDrawFailed = false;
    var warmCancelled = false;
    var changeListeners = [];
    function notifyChange() {
      var listeners = changeListeners.slice();
      var index;
      if (values.onChange) { values.onChange(); }
      for (index = 0; index < listeners.length; index += 1) {
        try { listeners[index](); } catch (ignore) {}
      }
    }
    function subscribe(callback) {
      if (typeof callback !== 'function') { return function () {}; }
      if (changeListeners.indexOf(callback) === -1) { changeListeners.push(callback); }
      return function () {
        var index = changeListeners.indexOf(callback);
        if (index !== -1) { changeListeners.splice(index, 1); }
      };
    }
    function cancelWarmup() {
      warmCancelled = true;
      clearWarmResources();
      if (worker) { try { worker.postMessage({ target: 'ploff-warm-cancel' }); } catch (ignore) {} }
      notifyChange();
    }
    function clearWarmResources() {
      if (warmTimer !== null && root.clearTimeout) { root.clearTimeout(warmTimer); }
      warmTimer = null;
      if (warmCanvas) { warmCanvas.width = warmCanvas.height = 1; }
      if (warmBuffer) { warmBuffer.width = warmBuffer.height = 1; }
      warmCanvas = warmBuffer = null;
    }
    function drawWarmFrame(data) {
      var start;
      var items = data.canvases || [];
      var index;
      var item;
      var ctx;
      var image;
      try {
        if (!items.length || !root.document) { return null; }
        start = Number(now());
        warmCanvas = warmCanvas || root.document.createElement('canvas');
        warmBuffer = warmBuffer || root.document.createElement('canvas');
        for (index = 0; index < items.length; index += 1) {
          item = items[index];
          warmBuffer.width = warmCanvas.width = item.w;
          warmBuffer.height = warmCanvas.height = item.h;
          ctx = warmBuffer.getContext('2d');
          image = ctx.createImageData(item.w, item.h);
          image.data.set(new Uint8ClampedArray(item.buffer));
          ctx.putImageData(image, 0, 0);
          warmCanvas.getContext('2d').drawImage(warmBuffer, 0, 0);
        }
        return Math.max(0, Number(now()) - start);
      } catch (ignore) { warmDrawFailed = true; return null; }
    }
    function sendWarmStep() {
      warmTimer = null;
      if (!worker || failed || warmCancelled || takenAt !== null || warmIndex >= ASS_WARMUP_TEXT.length) { return; }
      warmIndex += 1;
      try { worker.postMessage({ target: 'ploff-warm-step', index: warmIndex, time: warmIndex - 1 + 0.05, last: warmIndex === ASS_WARMUP_TEXT.length }); }
      catch (ignore) { warmDrawFailed = true; clearWarmResources(); }
    }
    function logTiming(name) {
      var consoleRef = root && root.console;
      if (consoleRef && typeof consoleRef.info === 'function') {
        try { consoleRef.info('PLOFF_ASS_PRELOAD', name, now()); } catch (ignore) {}
      }
    }

    function metric(name) {
      if (metrics && typeof metrics.mark === 'function') { metrics.mark(name); }
    }

    function recordWorkerTiming(data) {
      if (!metrics || typeof metrics.recordWorkerTiming !== 'function' || !data || data.target !== 'ploff-ass-timing') { return; }
      metrics.recordWorkerTiming(data.phase);
    }

    function detachPreloadListeners(target) {
      if (target && typeof target.removeEventListener === 'function') {
        try { target.removeEventListener('error', onWorkerError); } catch (ignore) {}
        try { target.removeEventListener('message', onWorkerMessage); } catch (ignore) {}
      }
    }

    function releaseOwnedWorker() {
      var target = worker;
      clearWarmResources();
      worker = null;
      if (!target) { return; }
      detachPreloadListeners(target);
      if (typeof target.terminate === 'function') {
        try { target.terminate(); } catch (ignore) {}
      }
    }

    function onWorkerError() {
      logTiming('preloader.worker-error');
      failed = true;
      releaseOwnedWorker();
      notifyChange();
    }

    function onWorkerMessage(event) {
      var data = event && event.data || {};
      var drawMs;
      if (!worker || failed || takenAt !== null) { return; }
      recordWorkerTiming(data);
      if (data.target === 'ready' && workerReadyAt === null) {
        workerReadyAt = Number(now());
        logTiming('preloader.worker-ready');
      } else if (data.target === 'ploff-ass-warm-step') {
        if (warmCancelled || data.cancelled || data.index !== warmIndex || warmSteps.length >= warmIndex) { return; }
        drawMs = drawWarmFrame(data);
        if (firstFrameAt === null && data.pixelCount > 0) {
          firstFrameAt = Number(now());
          metric('warmFirstFrame');
        }
        warmStepCount = Math.max(warmStepCount, Math.max(0, Number(data.warmStepCount) || 0));
        warmTotalMs = Math.max(0, Number(data.warmTotalMs) || 0);
        warmMaxMs = Math.max(0, Number(data.warmMaxMs) || 0);
        warmSteps.push({ index: warmIndex, libassMs: Number(data.libassMs) || 0,
          blendMs: Number(data.blendMs) || 0, drawMs: drawMs, pixelCount: Number(data.pixelCount) || 0 });
        warmComplete = data.warmComplete === true && warmSteps.length === ASS_WARMUP_TEXT.length &&
          !warmDrawFailed && warmSteps.every(function (step) { return step.pixelCount > 0 && step.drawMs !== null; });
        if (warmIndex < ASS_WARMUP_TEXT.length && typeof root.setTimeout === 'function') {
          warmTimer = root.setTimeout(sendWarmStep, 25);
        } else { clearWarmResources(); }
        notifyChange();
      }
    }

    function warmWorker(target) {
      if (!target || typeof target.postMessage !== 'function') { throw new Error('ASS legacy worker cannot be initialized'); }
      target.postMessage({
        target: 'worker-init',
        width: warmupWidth,
        height: warmupHeight,
        URL: String(root && root.document && root.document.URL || ''),
        currentScript: workerUrl,
        preMain: true,
        renderMode: 'js-blend',
        subUrl: null,
        subContent: warmupContent,
        fonts: [],
        availableFonts: [],
        fallbackFont: fallbackFont,
        lazyFileLoading: false,
        debug: false,
        targetFps: 24,
        libassMemoryLimit: 0,
        libassGlyphLimit: 0,
        dropAllAnimations: false
      });
      initSentAt = Number(now());
      metric('workerInitSent');
      logTiming('preloader.worker-init-sent');
    }

    function start() {
      if (started) { return false; }
      started = true;
      if (supportsWebAssembly(root) || typeof WorkerConstructor !== 'function') { return false; }
      requestedAt = Number(now());
      metric('workerRequested');
      try {
        worker = new WorkerConstructor(workerUrl);
        metric('workerCreated');
        if (worker && typeof worker.addEventListener === 'function') {
          worker.addEventListener('error', onWorkerError);
          worker.addEventListener('message', onWorkerMessage);
        }
        logTiming('preloader.worker-created');
        warmWorker(worker);
      } catch (workerError) {
        failed = true;
        releaseOwnedWorker();
        return false;
      }
      return !!worker;
    }

    function warm() {
      if (warmStarted || warmCancelled || !worker || failed || takenAt !== null || typeof worker.postMessage !== 'function') { return false; }
      warmStarted = true;
      warmStartedAt = metrics && metrics.elapsed ? metrics.elapsed() : null;
      sendWarmStep();
      logTiming('preloader.warm-started');
      notifyChange();
      return true;
    }

    function take(expectedWorkerUrl) {
      var target;
      if (expectedWorkerUrl && String(expectedWorkerUrl) !== workerUrl) { return null; }
      if (!worker || failed || takenAt !== null) { return null; }
      target = worker;
      worker = null;
      clearWarmResources();
      try { target.postMessage({ target: 'ploff-warm-cancel' }); } catch (ignore) {}
      detachPreloadListeners(target);
      takenAt = Number(now());
      notifyChange();
      return { worker: target, initialized: initSentAt !== null, subContent: warmupContent };
    }

    function destroy() { releaseOwnedWorker(); notifyChange(); changeListeners = []; }

    function snapshot() {
      return {
        workerUrl: workerUrl,
        started: started,
        available: !!worker,
        failed: failed,
        requestedAt: requestedAt,
        initSentAt: initSentAt,
        workerReadyAt: workerReadyAt,
        firstFrameAt: firstFrameAt,
        takenAt: takenAt,
        warmStepCount: warmStepCount,
        warmChunkCount: 0,
        warmTotalMs: warmTotalMs,
        warmMaxMs: warmMaxMs,
        warmComplete: warmComplete,
        warmStartedAt: warmStartedAt,
        warmSteps: warmSteps.map(function (step) {
          return { index: step.index, libassMs: step.libassMs, blendMs: step.blendMs, drawMs: step.drawMs, pixelCount: step.pixelCount };
        })
      };
    }

    return { start: start, warm: warm, cancelWarmup: cancelWarmup, take: take, destroy: destroy, snapshot: snapshot, subscribe: subscribe };
  }

  function create(options) {
    var values = options || {};
    var now = typeof values.now === 'function' ? values.now : function () { return new Date().getTime(); };
    var origin = Number(now()) || 0;
    var lastElapsed = 0;
    var marks = {};

    function reset() {
      origin = Number(now()) || 0;
      lastElapsed = 0;
      marks = {};
      return true;
    }

    function mark(name) {
      var key = NAMES[String(name || '')];
      var elapsed;
      if (!key) { return null; }
      if (Object.prototype.hasOwnProperty.call(marks, key)) { return marks[key]; }
      elapsed = Math.max(0, (Number(now()) || 0) - origin);
      lastElapsed = Math.max(lastElapsed, elapsed);
      marks[key] = lastElapsed;
      return marks[key];
    }

    function snapshot() {
      return {
        bootstrap: Object.prototype.hasOwnProperty.call(marks, 'bootstrap') ? marks.bootstrap : null,
        compositionReady: Object.prototype.hasOwnProperty.call(marks, 'compositionReady') ? marks.compositionReady : null,
        serverReady: Object.prototype.hasOwnProperty.call(marks, 'serverReady') ? marks.serverReady : null,
        firstHomeContent: Object.prototype.hasOwnProperty.call(marks, 'firstHomeContent') ? marks.firstHomeContent : null,
        firstFocusableUi: Object.prototype.hasOwnProperty.call(marks, 'firstFocusableUi') ? marks.firstFocusableUi : null,
        playerLoadStart: Object.prototype.hasOwnProperty.call(marks, 'playerLoadStart') ? marks.playerLoadStart : null,
        playerCodeReady: Object.prototype.hasOwnProperty.call(marks, 'playerCodeReady') ? marks.playerCodeReady : null,
        playerFeatureReady: Object.prototype.hasOwnProperty.call(marks, 'playerFeatureReady') ? marks.playerFeatureReady : null
      };
    }

    return { mark: mark, reset: reset, snapshot: snapshot };
  }

  return {
    create: create,
    assRenderingEnabledAtStartup: assRenderingEnabledAtStartup,
    createAssColdStartMetrics: createAssColdStartMetrics,
    createAssWorkerPreloader: createAssWorkerPreloader,
    refreshWarmTestPanel: refreshWarmTestPanel
  };
}));
