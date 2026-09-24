(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffDiagnosticsSupportRuntimeLoader = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var root = values.root || {};
    var document = values.document || root.document || null;
    var state = 'idle';
    var generation = 0;
    var script = null;
    var callbacks = [];
    var runtime = null;
    var failure = null;

    function loadedRuntime() {
      var snapshot = root.PloffSupportSnapshot;
      var qr = root.PloffSupportQr;
      if (!snapshot || typeof snapshot.create !== 'function' || !qr || typeof qr.create !== 'function' || typeof qr.render !== 'function') { return null; }
      return { SupportSnapshot: snapshot, SupportQr: qr };
    }

    function scriptUrl() {
      var scripts = document && typeof document.getElementsByTagName === 'function' ? document.getElementsByTagName('script') : [];
      var index;
      var source;
      var match;
      if (values.url) { return String(values.url); }
      for (index = scripts.length - 1; index >= 0; index -= 1) {
        source = typeof scripts[index].getAttribute === 'function' ? scripts[index].getAttribute('src') : scripts[index].src;
        match = String(source || '').match(/^(.*\/)?app\.js(\?[^#]*)?(?:#.*)?$/);
        if (match) { return (match[1] || '') + 'support.js' + (match[2] || ''); }
      }
      return 'support.js?v=dev';
    }

    function detachScript() {
      var current = script;
      script = null;
      if (!current) { return; }
      current.onload = null;
      current.onerror = null;
      try { if (current.parentNode) { current.parentNode.removeChild(current); } } catch (_error) { /* Already detached. */ }
    }

    function finish(token, error, value) {
      var pending;
      var index;
      var callbackError;
      var callbackFailed = false;
      if (token !== generation || state !== 'loading') { return; }
      state = error ? 'failed' : 'ready';
      failure = error;
      runtime = value;
      pending = callbacks;
      callbacks = [];
      detachScript();
      for (index = 0; index < pending.length; index += 1) {
        if (state === 'destroyed') { break; }
        try { pending[index](error, value); }
        catch (caught) { if (!callbackFailed) { callbackFailed = true; callbackError = caught; } }
      }
      if (callbackFailed) { throw callbackError; }
    }

    function ensure(callback) {
      var token;
      var value;
      var parent;
      if (state === 'destroyed') {
        if (typeof callback === 'function') { callback(new Error('Diagnostics support runtime loader is destroyed'), null); }
        return;
      }
      if (state === 'ready' || state === 'failed') {
        if (typeof callback === 'function') { callback(failure, runtime); }
        return;
      }
      if (typeof callback === 'function') { callbacks.push(callback); }
      if (state === 'loading') { return; }
      state = 'loading';
      token = generation += 1;
      value = loadedRuntime();
      if (value) { finish(token, null, value); return; }
      try {
        script = document.createElement('script');
        script.async = true;
        script.src = scriptUrl();
        script.onload = function () {
          var loaded = loadedRuntime();
          finish(token, loaded ? null : new Error('Diagnostics support runtime is unavailable'), loaded);
        };
        script.onerror = function () { finish(token, new Error('Diagnostics support runtime could not be loaded'), null); };
        parent = document.head || document.body || document.documentElement;
        parent.appendChild(script);
      } catch (_error) {
        finish(token, new Error('Diagnostics support runtime could not be loaded'), null);
      }
    }

    function reset() {
      if (state !== 'failed') { return false; }
      generation += 1;
      failure = null;
      runtime = null;
      state = 'idle';
      return true;
    }

    function snapshot() { return { state: state, pendingCount: callbacks.length }; }

    function destroy() {
      if (state === 'destroyed') { return; }
      state = 'destroyed';
      generation += 1;
      callbacks = [];
      runtime = null;
      failure = null;
      detachScript();
    }

    return { ensure: ensure, reset: reset, snapshot: snapshot, destroy: destroy };
  }

  return { create: create };
}));
