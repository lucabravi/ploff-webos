(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffPlayerRuntimeLoader = factory(); }
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
    var composition = null;
    var failure = null;

    function loadedComposition() {
      var candidate = root.PloffPlayerComposition;
      return candidate && typeof candidate.create === 'function' ? candidate : null;
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
        if (match) { return (match[1] || '') + 'player.js' + (match[2] || ''); }
      }
      return 'player.js?v=dev';
    }

    function notify(callback) {
      if (typeof callback !== 'function') { return; }
      try { callback(); } catch (_error) { /* Metrics must never own the load lifecycle. */ }
    }

    function detachScript() {
      var current = script;
      script = null;
      if (!current) { return; }
      current.onload = null;
      current.onerror = null;
      try { if (current.parentNode) { current.parentNode.removeChild(current); } } catch (_error) { /* Already detached. */ }
    }

    function finish(token, error, module) {
      var pending;
      var index;
      var callbackError;
      var callbackFailed = false;
      if (token !== generation || state !== 'loading') { return; }
      state = error ? 'failed' : 'ready';
      failure = error;
      composition = module;
      pending = callbacks;
      callbacks = [];
      detachScript();
      if (!error) { notify(values.onCodeReady); }
      for (index = 0; index < pending.length; index += 1) {
        if (state === 'destroyed') { break; }
        try { pending[index](error, module); }
        catch (caught) { if (!callbackFailed) { callbackFailed = true; callbackError = caught; } }
      }
      if (callbackFailed) { throw callbackError; }
    }

    function ensure(callback) {
      var token;
      var module;
      var parent;
      if (state === 'destroyed') {
        if (typeof callback === 'function') { callback(new Error('Player runtime loader is destroyed'), null); }
        return;
      }
      if (state === 'ready' || state === 'failed') {
        if (typeof callback === 'function') { callback(failure, composition); }
        return;
      }
      if (typeof callback === 'function') { callbacks.push(callback); }
      if (state === 'loading') { return; }
      state = 'loading';
      token = generation += 1;
      module = loadedComposition();
      if (module) { finish(token, null, module); return; }
      notify(values.onLoadStart);
      if (token !== generation || state !== 'loading') { return; }
      try {
        script = document.createElement('script');
        script.async = true;
        script.src = scriptUrl();
        script.onload = function () {
          var loaded = loadedComposition();
          finish(token, loaded ? null : new Error('Player composition is unavailable'), loaded);
        };
        script.onerror = function () { finish(token, new Error('Player runtime could not be loaded'), null); };
        parent = document.head || document.body || document.documentElement;
        parent.appendChild(script);
      } catch (error) {
        if (token !== generation || state !== 'loading') { throw error; }
        finish(token, new Error('Player runtime could not be loaded'), null);
      }
    }

    function reset() {
      if (state !== 'failed') { return false; }
      generation += 1;
      failure = null;
      composition = null;
      state = 'idle';
      return true;
    }

    function snapshot() { return { state: state, pendingCount: callbacks.length }; }

    function destroy() {
      if (state === 'destroyed') { return; }
      state = 'destroyed';
      generation += 1;
      callbacks = [];
      composition = null;
      failure = null;
      detachScript();
    }

    return { ensure: ensure, reset: reset, snapshot: snapshot, destroy: destroy };
  }

  return { create: create };
}));
