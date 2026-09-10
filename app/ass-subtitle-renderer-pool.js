(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffAssSubtitleRendererPool = factory(); }
}(this, function () {
  'use strict';

  var WARMUP_ASS = '[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,20,20,30,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:00.10,Default,,0,0,0,,Ploff\n';

  function call(target, name, args) {
    if (target && typeof target[name] === 'function') { return target[name].apply(target, args || []); }
    return undefined;
  }

  function cancelledError(reason) {
    /** @type {*} */
    var error = new Error(String(reason || 'ASS subtitle renderer load cancelled'));
    error.cancelled = true;
    return error;
  }

  function create(options) {
    var values = options || {};
    var rendererModule = values.rendererModule;
    var metrics = values.metrics || null;
    var renderer = null;
    var destroyed = false;
    var prewarmStarted = false;
    var runtimeErrorHandler = null;
    var activeLoad = null;
    var pendingLoad = null;
    var loadedContent = null;
    var loadSequence = 0;

    function ensureRenderer() {
      if (renderer || destroyed || !rendererModule || typeof rendererModule.create !== 'function') { return renderer; }
      renderer = rendererModule.create({
        root: values.root || {},
        document: values.document || null,
        videoDimensions: values.videoDimensions,
        canvasId: 'ass-subtitle-overlay',
        onRuntimeError: function (error) {
          if (typeof runtimeErrorHandler === 'function') { runtimeErrorHandler(error); }
        },
        onTiming: function (phase) {
          if (metrics && typeof metrics.recordWorkerTiming === 'function') { metrics.recordWorkerTiming(phase); }
        },
        onSyncTiming: function (stage, sample) {
          if (metrics && typeof metrics.recordAssSync === 'function') { return metrics.recordAssSync(stage, sample); }
          return true;
        }
      });
      return renderer;
    }

    function prewarm() {
      var target;
      if (prewarmStarted || destroyed) { return false; }
      target = ensureRenderer();
      if (!target) { return false; }
      prewarmStarted = true;
      if (typeof target.prewarm === 'function') {
        target.prewarm(function () {});
        return true;
      }
      if (typeof target.load !== 'function') { return false; }
      enqueueLoad(WARMUP_ASS, function () {});
      return true;
    }

    function settleLoad(operation, error) {
      var callbacks = operation.callbacks.slice();
      var index;
      operation.callbacks = [];
      for (index = 0; index < callbacks.length; index += 1) {
        if (typeof callbacks[index] === 'function') { callbacks[index](error || null); }
      }
    }

    function startLoad(operation) {
      var target = renderer;
      activeLoad = operation;
      if (!operation.warmup && metrics && typeof metrics.beginRealAssSetTrack === 'function') { metrics.beginRealAssSetTrack(); }
      try {
        target.load(operation.content, function (error) {
          var next;
          if (activeLoad !== operation) { return; }
          activeLoad = null;
          if (error) {
            loadedContent = null;
          } else {
            loadedContent = operation.content;
            if (!operation.warmup && metrics && typeof metrics.endRealAssSetTrack === 'function') { metrics.endRealAssSetTrack(); }
          }
          settleLoad(operation, error || null);
          next = pendingLoad;
          pendingLoad = null;
          if (next && !destroyed) { startLoad(next); }
        });
      } catch (error) {
        activeLoad = null;
        settleLoad(operation, error);
        if (pendingLoad && !destroyed) {
          operation = pendingLoad;
          pendingLoad = null;
          startLoad(operation);
        }
      }
    }

    function enqueueLoad(content, identity, callback) {
      var operation;
      if (typeof identity === 'function') {
        callback = identity;
        identity = '';
      }
      if (destroyed || !renderer || typeof renderer.load !== 'function') {
        if (typeof callback === 'function') { callback(new Error('ASS subtitle renderer unavailable')); }
        return false;
      }
      content = String(content || '');
      identity = String(identity || '');
      if (!activeLoad && !pendingLoad && loadedContent === content) {
        if (typeof callback === 'function') { callback(null); }
        return true;
      }
      if (activeLoad && activeLoad.content === content) {
        if (typeof callback === 'function') { activeLoad.callbacks.push(callback); }
        return true;
      }
      if (pendingLoad && pendingLoad.content === content) {
        if (typeof callback === 'function') { pendingLoad.callbacks.push(callback); }
        return true;
      }
      operation = { id: loadSequence += 1, content: content, callbacks: [], warmup: content === WARMUP_ASS };
      if (typeof callback === 'function') { operation.callbacks.push(callback); }
      loadedContent = null;
      if (!activeLoad) { startLoad(operation); return true; }
      if (pendingLoad) { settleLoad(pendingLoad, cancelledError('ASS subtitle track superseded')); }
      pendingLoad = operation;
      return true;
    }

    function lease(leaseOptions) {
      var target = ensureRenderer();
      var leaseValues = leaseOptions || {};
      runtimeErrorHandler = leaseValues.onRuntimeError || runtimeErrorHandler;
      return {
        load: function (content, callback) { return enqueueLoad(String(content || ''), callback); },
        setTime: function (seconds, paused) { return call(target, 'setTime', [seconds, paused]); },
        discontinuity: function (seconds) { return call(target, 'discontinuity', [seconds]); },
        setSize: function (size) { return call(target, 'setSize', [size]); },
        show: function () { return call(target, 'show'); },
        hide: function () { return call(target, 'hide'); },
        resize: function () { return call(target, 'resize'); },
        dispose: function () {
          if (target && typeof target.suspend === 'function') { return target.suspend(); }
          return call(target, 'hide');
        },
        isVisible: function () { return call(target, 'isVisible'); }
      };
    }

    function prepare(content, identity, callback) {
      return enqueueLoad(String(content || ''), identity, callback);
    }

    function destroy() {
      if (destroyed) { return; }
      destroyed = true;
      runtimeErrorHandler = null;
      if (pendingLoad) { settleLoad(pendingLoad, cancelledError('ASS subtitle renderer pool destroyed')); pendingLoad = null; }
      if (activeLoad) { settleLoad(activeLoad, cancelledError('ASS subtitle renderer pool destroyed')); activeLoad = null; }
      loadedContent = null;
      call(renderer, 'dispose');
      renderer = null;
    }

    return { prewarm: prewarm, prepare: prepare, create: lease, destroy: destroy };
  }

  return { create: create };
}));
