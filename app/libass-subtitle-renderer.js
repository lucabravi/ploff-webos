(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.PloffAssSubtitleRenderer = factory(root);
  }
}(this, function (globalRoot) {
  'use strict';

  var VERSION = '4.1.0-os';
  var LEGACY_WORKER_VERSION = '4.1.0-os-mem1&assTiming=1&assSync=12';
  var scriptUrl = 'vendor/subtitles-octopus.js?v=' + VERSION;
  var workerUrl = 'vendor/subtitles-octopus-worker.js?v=' + VERSION;
  var legacyWorkerUrl = 'vendor/subtitles-octopus-worker-legacy.js?v=' + LEGACY_WORKER_VERSION;
  var fallbackFontUrl = 'default.woff2?v=' + VERSION;
  var FALLBACK_SIZE_FACTOR = 0.75;
  var libraryConstructor = null;
  var libraryLoading = null;

  /**
   * @param {Function} callback
   * @param {*} _first
   * @param {*=} _second
   */
  function call(callback, _first, _second) {
    if (typeof callback === 'function') { callback.apply(null, Array.prototype.slice.call(arguments, 1)); }
  }

  function once(callback) {
    var called = false;
    return function () {
      if (called) { return; }
      called = true;
      call.apply(null, [callback].concat(Array.prototype.slice.call(arguments)));
    };
  }

  function error(message) { return new Error(String(message || 'ASS subtitle renderer unavailable')); }

  function takePreloadedWorker(runtimeRoot, options) {
    var preloader = options && options.workerPreloader || runtimeRoot && runtimeRoot.PloffAssSubtitleWorkerPreloader;
    var claimed;
    if (!preloader || typeof preloader.take !== 'function') { return null; }
    try { claimed = preloader.take(legacyWorkerUrl) || null; }
    catch (ignore) { return null; }
    if (!claimed) { return null; }
    if (claimed.worker) { return claimed; }
    return { worker: claimed, initialized: false, subContent: null };
  }

  function constructorFor(runtimeRoot, options) {
    return (options && options.SubtitlesOctopus) ||
      (runtimeRoot && runtimeRoot.SubtitlesOctopus) ||
      (globalRoot && globalRoot.SubtitlesOctopus) || null;
  }

  function loadLibrary(runtimeRoot, documentRef, options, callback) {
    var existing = constructorFor(runtimeRoot, options);
    var script;
    var finish;
    var appendTarget;
    if (existing) {
      libraryConstructor = existing;
      call(callback, null, existing);
      return;
    }
    if (libraryConstructor) {
      call(callback, null, libraryConstructor);
      return;
    }
    if (libraryLoading) {
      libraryLoading.push(callback);
      return;
    }
    if (options && typeof options.loadScript === 'function') {
      options.loadScript(scriptUrl, function (loadError, loaded) {
        var resolved = loaded || constructorFor(runtimeRoot, options);
        if (!loadError && resolved) { libraryConstructor = resolved; }
        call(callback, loadError || (!resolved ? error('JavascriptSubtitlesOctopus did not load') : null), resolved);
      });
      return;
    }
    if (!documentRef || typeof documentRef.createElement !== 'function') {
      call(callback, error('subtitle renderer requires a document'));
      return;
    }
    libraryLoading = [callback];
    finish = function (loadError) {
      var callbacks = libraryLoading || [];
      var resolved = constructorFor(runtimeRoot, options);
      var index;
      libraryLoading = null;
      if (!loadError && resolved) { libraryConstructor = resolved; }
      if (!loadError && !resolved) { loadError = error('JavascriptSubtitlesOctopus did not load'); }
      for (index = 0; index < callbacks.length; index += 1) {
        call(callbacks[index], loadError || null, resolved || libraryConstructor);
      }
    };
    script = documentRef.createElement('script');
    script.async = true;
    script.src = scriptUrl;
    script.onload = function () { finish(); };
    script.onerror = function () { finish(error('JavascriptSubtitlesOctopus failed to load')); };
    appendTarget = documentRef.head || documentRef.body || documentRef.documentElement;
    if (!appendTarget || typeof appendTarget.appendChild !== 'function') {
      finish(error('subtitle renderer cannot append its loader')); return;
    }
    appendTarget.appendChild(script);
  }

  function hasClass(element, name) {
    return element && new RegExp('(^|\\s)' + name + '(?:\\s|$)').test(String(element.className || ''));
  }

  function setVisible(canvas, visible) {
    var className = String(canvas && canvas.className || '').replace(/(^|\s)is-hidden(?=\s|$)/g, '');
    if (!visible) { className = (className + ' is-hidden').replace(/^\s+/, ''); }
    canvas.className = className;
    canvas.style.display = visible ? 'block' : 'none';
    canvas.style.pointerEvents = 'none';
  }

  function dimensions(video, documentRef, videoDimensions) {
    var measured = typeof videoDimensions === 'function' ? videoDimensions() || {} : {};
    var width = Number(documentRef && documentRef.documentElement && documentRef.documentElement.clientWidth || 0);
    var height = Number(documentRef && documentRef.documentElement && documentRef.documentElement.clientHeight || 0);
    var canvas;
    if (!width || !height) {
      width = Number(video && video.offsetWidth || measured.width || video && video.videoWidth || 0);
      height = Number(video && video.offsetHeight || measured.height || video && video.videoHeight || 0);
    }
    if (!width || !height) { width = 1920; height = 1080; }
    canvas = { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
    return canvas;
  }

  function create(options) {
    var values = options || {};
    var runtimeRoot = values.root || globalRoot;
    var documentRef = values.document || (runtimeRoot && runtimeRoot.document) || null;
    var video = values.video || null;
    var videoDimensions = values.videoDimensions;
    var canvas = values.canvas || (documentRef && documentRef.getElementById ? documentRef.getElementById(values.canvasId || 'ass-subtitle-overlay') : null);
    var instance = null;
    var instanceReady = false;
    var generation = 0;
    var disposed = false;
    var currentTime = 0;
    var paused = true;
    var clockReceived = false;
    var frameReleasePending = false;
    var frameReleaseGeneration = 0;
    var suspended = false;
    var subtitleSize = 100;
    var baseStyles = null;
    var fallbackDependent = false;
    var styleLoadGeneration = 0;
    var readinessTimer = null;
    var readinessTimerClear = null;
    var readinessTimerToken = null;

    var READINESS_RETRY_DELAY = 100;
    var READINESS_MAX_ATTEMPTS = 6;

    function normalizedSize(value) {
      var size = Number(value || 100);
      if (!isFinite(size)) { size = 100; }
      return Math.max(50, Math.min(200, size));
    }

    function normalizedFontName(value) {
      return String(value || '').replace(/^\s*@/, '').replace(/^\s+|\s+$/g, '').toLowerCase();
    }

    function requestedFonts(content) {
      var lines = String(content || '').split(/[\r\n]+/g);
      var names = [];
      var format = null;
      var index;
      var line;
      var values;
      var fontIndex;
      var match;
      function add(value) {
        var normalized = normalizedFontName(value);
        if (normalized && names.indexOf(normalized) === -1) { names.push(normalized); }
      }
      for (index = 0; index < lines.length; index += 1) {
        line = lines[index];
        if (/^Format\s*:/i.test(line)) {
          format = line.substring(line.indexOf(':') + 1).split(',').map(function (value) {
            return String(value || '').replace(/^\s+|\s+$/g, '').toLowerCase();
          });
          continue;
        }
        if (/^Style\s*:/i.test(line)) {
          values = line.substring(line.indexOf(':') + 1).split(',');
          fontIndex = format ? format.indexOf('fontname') : 1;
          if (fontIndex < 0) { fontIndex = 1; }
          add(values[fontIndex]);
        }
        match = /\\fn([^}]+)/g;
        while ((match = match.exec(line)) !== null) { add(match[1]); }
      }
      return names;
    }

    function usesFallbackFont(content) {
      var available = values.availableFontNames || [];
      var names = requestedFonts(content);
      var index;
      var availableNames = [];
      if (Object.prototype.toString.call(available) !== '[object Array]') { available = []; }
      for (index = 0; index < available.length; index += 1) {
        availableNames.push(normalizedFontName(available[index]));
      }
      for (index = 0; index < names.length; index += 1) {
        if (availableNames.indexOf(names[index]) === -1) { return true; }
      }
      return false;
    }

    function applySubtitleSize() {
      var index;
      var entry;
      if (!instance || !baseStyles || typeof instance.setStyle !== 'function') { return; }
      for (index = 0; index < baseStyles.length; index += 1) {
        entry = baseStyles[index];
        instance.setStyle({ FontSize: entry.fontSize * subtitleSize / 100 * (fallbackDependent ? FALLBACK_SIZE_FACTOR : 1) }, entry.index);
      }
      if (typeof instance.setCurrentTime === 'function' && canvas && !hasClass(canvas, 'is-hidden')) { instance.setCurrentTime(currentTime); }
    }

    function captureBaseStyles(callback) {
      var target = instance;
      var targetGeneration = generation;
      if (!target || typeof target.getStyles !== 'function' || typeof target.setStyle !== 'function') { if (typeof callback === 'function') { callback(); } return; }
      if (styleLoadGeneration === targetGeneration) { if (typeof callback === 'function') { callback(); } return; }
      styleLoadGeneration = targetGeneration;
      target.getStyles(function (styles) {
        if (disposed || generation !== targetGeneration || instance !== target) { return; }
        baseStyles = (styles || []).map(function (style, index) {
          var fontSize = Number(style && style.FontSize);
          return {
            index: style && style._index !== undefined ? style._index : index,
            fontSize: isFinite(fontSize) && fontSize > 0 ? fontSize : 0
          };
        }).filter(function (style) { return style.fontSize > 0; });
        applySubtitleSize();
        if (typeof callback === 'function') { callback(); }
      }, function () {
        if (disposed || generation !== targetGeneration || instance !== target) { return; }
        styleLoadGeneration = 0;
        if (typeof callback === 'function') { callback(); }
      });
    }

    function resize() {
      var size;
      if (!canvas) { return; }
      size = dimensions(video, documentRef, videoDimensions);
      canvas.width = size.width;
      canvas.height = size.height;
      if (instance && typeof instance.resize === 'function') { instance.resize(size.width, size.height, 0, 0); }
    }

    function clearCanvas() {
      var context;
      if (!canvas || typeof canvas.getContext !== 'function') { return; }
      try {
        context = canvas.getContext('2d');
        if (context && typeof context.clearRect === 'function') { context.clearRect(0, 0, canvas.width, canvas.height); }
      } catch (ignore) {}
    }

    function hide() { if (canvas) { setVisible(canvas, false); } }
    function show() {
      if (!canvas) { return; }
      if (hasClass(canvas, 'is-hidden')) { clearCanvas(); }
      setVisible(canvas, true);
    }

    function applyClock(target) {
      if (!target) { return; }
      if (typeof target.setIsPaused === 'function') {
        target.setIsPaused(paused, currentTime);
      } else if (typeof target.setCurrentTime === 'function') {
        target.setCurrentTime(currentTime);
      }
    }

    function suppressPreparedFrames(target) {
      frameReleasePending = true;
      frameReleaseGeneration = generation;
      if (target && typeof target.setWorkerFrameSuppressed === 'function') { target.setWorkerFrameSuppressed(true); }
    }

    function releasePreparedFrames() {
      var target = instance;
      var targetGeneration = generation;
      if (!target || !instanceReady || !frameReleasePending || !clockReceived) { return null; }
      if (typeof target.releaseWorkerFramesAt === 'function') {
        target.releaseWorkerFramesAt(currentTime, paused, function () {
          if (disposed || generation !== targetGeneration || instance !== target) { return; }
          if (frameReleaseGeneration === targetGeneration) { frameReleasePending = false; }
        });
        return true;
      }
      frameReleasePending = false;
      if (typeof target.setWorkerFrameSuppressed === 'function') { target.setWorkerFrameSuppressed(false); }
      applyClock(target);
      return false;
    }

    function disposeInstance() {
      instanceReady = false;
      if (instance && typeof instance.dispose === 'function') {
        try { instance.dispose(); } catch (ignore) {}
      }
      instance = null;
      hide();
    }

    function clearReadinessTimer() {
      if (readinessTimer !== null && typeof readinessTimerClear === 'function') {
        try { readinessTimerClear(readinessTimer); } catch (ignore) {}
      }
      readinessTimer = null;
      readinessTimerClear = null;
      readinessTimerToken = null;
    }

    function scheduleReadinessRetry(callback) {
      var scheduler = runtimeRoot && typeof runtimeRoot.setTimeout === 'function' ? runtimeRoot.setTimeout : null;
      var clearer = runtimeRoot && typeof runtimeRoot.clearTimeout === 'function' ? runtimeRoot.clearTimeout : null;
      var token = {};
      var timerId;
      if (!scheduler && globalRoot && typeof globalRoot.setTimeout === 'function') {
        scheduler = globalRoot.setTimeout;
        clearer = globalRoot && typeof globalRoot.clearTimeout === 'function' ? globalRoot.clearTimeout : null;
      }
      if (!scheduler && typeof setTimeout === 'function') {
        scheduler = setTimeout;
        clearer = typeof clearTimeout === 'function' ? clearTimeout : null;
      }
      if (!scheduler) { return false; }
      readinessTimerToken = token;
      readinessTimerClear = clearer;
      timerId = scheduler(function () {
        if (readinessTimerToken !== token) { return; }
        readinessTimer = null;
        readinessTimerClear = null;
        readinessTimerToken = null;
        callback();
      }, READINESS_RETRY_DELAY);
      if (readinessTimerToken === token) { readinessTimer = timerId; }
      else if (typeof clearer === 'function') {
        try { clearer(timerId); } catch (ignore) {}
      }
      return true;
    }

    function prewarm(callback) {
      if (disposed) { call(callback, error('ASS subtitle renderer disposed')); return false; }
      loadLibrary(runtimeRoot, documentRef, values, function (loadError, LoadedConstructor) {
        call(callback, loadError || (!LoadedConstructor ? error('JavascriptSubtitlesOctopus did not load') : null));
      });
      return true;
    }

    function load(content, callback) {
      var loadGeneration = generation + 1;
      var complete = once(callback);
      var Constructor;
      var ready;
      var finishReady;
      var current;
      var claimedWorker = null;
      var constructing = false;
      var pendingReady = false;
      var pendingReadyError = null;
      var readySucceeded = false;
      var runtimeFailed = false;
      var readinessAttempts = 0;
      var readinessStarted = false;
      var readinessTarget = null;
      function probeWorkerReadiness(target, targetGeneration, onReady, onFailure) {
        var probeCompleted = false;
        function failProbe(requestError) {
          if (probeCompleted) { return; }
          probeCompleted = true;
          if (disposed || targetGeneration !== generation || instance !== target) { return; }
          if (readinessAttempts >= READINESS_MAX_ATTEMPTS || !scheduleReadinessRetry(function () {
            if (disposed || targetGeneration !== generation || instance !== target) { return; }
            probeWorkerReadiness(target, targetGeneration, onReady, onFailure);
          })) {
            clearReadinessTimer();
            onFailure(requestError || error('JavascriptSubtitlesOctopus worker did not become responsive'));
          }
        }
        if (disposed || targetGeneration !== generation || instance !== target) { return; }
        if (!target || typeof target.getEvents !== 'function') { onReady(); return; }
        readinessAttempts += 1;
        if (readinessAttempts > READINESS_MAX_ATTEMPTS) {
          onFailure(error('JavascriptSubtitlesOctopus worker did not become responsive'));
          return;
        }
        try {
          target.getEvents(function () {
            if (probeCompleted) { return; }
            probeCompleted = true;
            if (disposed || targetGeneration !== generation || instance !== target) { return; }
            clearReadinessTimer();
            onReady();
          }, failProbe);
        } catch (requestError) { failProbe(requestError); }
      }
      function replaceWarmTrack(target) {
        function failReplacement(replacementError) {
          if (disposed || loadGeneration !== generation || instance !== target) { return; }
          clearReadinessTimer();
          disposeInstance();
          complete.apply(null, [replacementError || error('JavascriptSubtitlesOctopus track replacement failed')]);
        }
        function finishReplacement() {
          if (disposed || loadGeneration !== generation || instance !== target) { return; }
          resize();
          captureBaseStyles(function () {
            if (disposed || loadGeneration !== generation || instance !== target) { return; }
            instanceReady = true;
            suppressPreparedFrames(target);
            releasePreparedFrames();
            complete.apply(null, [null]);
          });
        }
        generation = loadGeneration;
        instanceReady = false;
        clockReceived = false;
        frameReleasePending = false;
        baseStyles = null;
        fallbackDependent = usesFallbackFont(content);
        styleLoadGeneration = 0;
        clearReadinessTimer();
        hide();
        suppressPreparedFrames(target);
        try {
          target.setTrack(String(content || ''));
          probeWorkerReadiness(target, loadGeneration, finishReplacement, failReplacement);
        } catch (replacementError) { failReplacement(replacementError); }
      }
      if (instance && instanceReady && typeof instance.setTrack === 'function' && typeof instance.getEvents === 'function') {
        replaceWarmTrack(instance);
        return;
      }
      generation = loadGeneration;
      disposed = false;
      clockReceived = false;
      frameReleasePending = false;
      baseStyles = null;
      fallbackDependent = usesFallbackFont(content);
      styleLoadGeneration = 0;
      clearReadinessTimer();
      disposeInstance();
      hide();
      if (!canvas) { complete.apply(null, [error('ASS subtitle canvas is missing')]); return; }
      resize();
      loadLibrary(runtimeRoot, documentRef, values, function (loadError, LoadedConstructor) {
        var instanceOptions;
        if (disposed || loadGeneration !== generation) { return; }
        if (loadError || !LoadedConstructor) { complete.apply(null, [loadError || error()]); return; }
        Constructor = LoadedConstructor;
        finishReady = once(function (readyError) {
          if (disposed || loadGeneration !== generation) { return; }
          clearReadinessTimer();
          if (readyError) {
            disposeInstance();
            complete.apply(null, [readyError]);
            return;
          }
          readySucceeded = true;
          resize();
          captureBaseStyles(function () {
            if (disposed || loadGeneration !== generation || !instance) { return; }
            instanceReady = true;
            suppressPreparedFrames(instance);
            releasePreparedFrames();
            complete.apply(null, [null]);
          });
        });
        function beginReadiness(readyError) {
          if (readyError) { finishReady(readyError); return; }
          if (readinessStarted) { return; }
          readinessStarted = true;
          readinessTarget = instance;
          probeWorkerReadiness(readinessTarget, loadGeneration, function () { finishReady(null); }, finishReady);
        }
        ready = function (readyError) {
          if (constructing) {
            if (!pendingReady) {
              pendingReady = true;
              pendingReadyError = readyError || null;
            }
            return;
          }
          beginReadiness(readyError);
        };
        function failRenderer(rendererError) {
          rendererError = rendererError || error();
          if (constructing) {
            pendingReady = true;
            pendingReadyError = rendererError;
            return;
          }
          if (!readySucceeded) {
            ready(rendererError);
            return;
          }
          if (runtimeFailed || disposed || loadGeneration !== generation) { return; }
          runtimeFailed = true;
          instanceReady = false;
          if (values.debug === true) { disposeInstance(); }
          else { instance = null; hide(); }
          call(values.onRuntimeError, rendererError);
        }
        instanceOptions = {
          canvas: canvas,
          renderMode: 'js-blend',
          workerUrl: workerUrl,
          legacyWorkerUrl: legacyWorkerUrl,
          fallbackFont: fallbackFontUrl,
          subContent: String(content || ''),
          suppressWorkerFrames: true,
          debug: values.debug === true,
          onReady: function () { ready(null); },
          onError: failRenderer,
          onTiming: function (phase) { call(values.onTiming, phase); },
          onSyncTiming: function (stage, sample) { return call(values.onSyncTiming, stage, sample); }
        };
        claimedWorker = takePreloadedWorker(runtimeRoot, values);
        if (claimedWorker && claimedWorker.worker) {
          instanceOptions.worker = claimedWorker.worker;
          instanceOptions.workerInitialized = claimedWorker.initialized === true;
          instanceOptions.workerSubContent = claimedWorker.subContent === undefined ? null : claimedWorker.subContent;
        }
        try {
          constructing = true;
          current = new Constructor(instanceOptions);
          instance = current;
          constructing = false;
          if (pendingReady) { beginReadiness(pendingReadyError); }
        } catch (constructorError) {
          constructing = false;
          if (claimedWorker && claimedWorker.worker && typeof claimedWorker.worker.terminate === 'function') {
            try { claimedWorker.worker.terminate(); } catch (ignore) {}
          }
          finishReady(pendingReady ? (pendingReadyError || constructorError) : constructorError);
        }
      });
    }

    function setTime(seconds, isPaused) {
      var wasPaused = paused;
      var resumeFromSuspend = suspended;
      currentTime = Math.max(0, Number(seconds || 0));
      paused = isPaused === true;
      suspended = false;
      clockReceived = true;
      call(values.onSyncTiming, 'renderer', {
        requestedTime: currentTime,
        paused: paused,
        frameReleasePending: frameReleasePending
      });
      if (!instance || !instanceReady) { return; }
      if (frameReleasePending) {
        if (releasePreparedFrames() === false && typeof instance.setIsPaused === 'function' && typeof instance.setCurrentTime === 'function') {
          instance.setCurrentTime(currentTime);
        }
        return;
      }
      if (resumeFromSuspend && typeof instance.setWorkerFrameSuppressed === 'function') { instance.setWorkerFrameSuppressed(false); }
      applyClock(instance);
      if (wasPaused === false && paused === true && typeof instance.setIsPaused === 'function' && typeof instance.setCurrentTime === 'function') {
        instance.setCurrentTime(currentTime);
      }
    }


    function suspend() {
      suspended = true;
      paused = true;
      clockReceived = true;
      frameReleasePending = false;
      if (instance && instanceReady) {
        if (typeof instance.markDiscontinuity === 'function') { instance.markDiscontinuity(currentTime); }
        if (typeof instance.setWorkerFrameSuppressed === 'function') { instance.setWorkerFrameSuppressed(true); }
        applyClock(instance);
      }
      hide();
    }

    function discontinuity(seconds) {
      var value = Number(seconds);
      if (isFinite(value)) { currentTime = Math.max(0, value); }
      if (instance && typeof instance.markDiscontinuity === 'function') {
        instance.markDiscontinuity(isFinite(value) ? currentTime : undefined);
      }
    }

    function setSize(value) {
      subtitleSize = normalizedSize(value);
      if (baseStyles) { applySubtitleSize(); }
      else { captureBaseStyles(); }
    }

    function dispose() {
      disposed = true;
      generation += 1;
      clearReadinessTimer();
      disposeInstance();
    }

    hide();
    return {
      load: load,
      prewarm: prewarm,
      setTime: setTime,
      suspend: suspend,
      discontinuity: discontinuity,
      setSize: setSize,
      show: show,
      hide: hide,
      resize: resize,
      dispose: dispose,
      isVisible: function () { return !!canvas && !hasClass(canvas, 'is-hidden'); }
    };
  }

  return {
    create: create,
    version: VERSION
  };
}));
