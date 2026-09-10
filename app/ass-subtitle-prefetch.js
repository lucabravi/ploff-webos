(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffAssSubtitlePrefetch = factory(); }
}(this, function () {
  'use strict';

  function call(callback, error, value) {
    if (typeof callback === 'function') { callback(error || null, value === undefined ? null : value); }
  }

  function cancelledError(reason) {
    /** @type {*} */
    var error = new Error(String(reason || 'ASS subtitle prefetch cancelled'));
    error.cancelled = true;
    return error;
  }

  function create(options) {
    var values = options || {};
    var metrics = values.metrics || null;
    var active = null;
    var cached = null;
    var generation = 0;
    var destroyed = false;
    var operationId = 0;

    function transportLoad(target, callback) {
      var client = values.PlexClient;
      if (typeof values.load === 'function') { return values.load(target, callback); }
      if (client && typeof client.loadSubtitleText === 'function') {
        return client.loadSubtitleText(values.config || {}, target && (target.playback || target.detail) || {}, target && target.track, callback);
      }
      call(callback, new Error('ASS subtitle prefetch transport unavailable'));
      return null;
    }

    function identityOf(target) {
      return String(target && target.identity || '');
    }

    function priorityOf(optionsValue) {
      return optionsValue && optionsValue.priority === 'foreground' ? 'foreground' : 'speculative';
    }

    function notify() {
      if (typeof values.onState === 'function') { values.onState(snapshot()); }
    }

    function settle(operation, error, content) {
      var callbacks;
      var index;
      if (!operation || operation.settled) { return; }
      operation.settled = true;
      callbacks = operation.callbacks.slice();
      operation.callbacks = [];
      if (active === operation) { active = null; }
      if (!error && typeof content === 'string' && content.length) {
        cached = { identity: operation.identity, content: content, target: operation.target };
        if (metrics && typeof metrics.endRealAssFetch === 'function') { metrics.endRealAssFetch(); }
      }
      for (index = 0; index < callbacks.length; index += 1) { call(callbacks[index], error, error ? null : content); }
      notify();
    }

    function cancelActive(reason) {
      var operation = active;
      var request;
      var error;
      if (!operation) { return false; }
      active = null;
      generation += 1;
      request = operation.request;
      if (request && typeof request.abort === 'function') {
        try { request.abort(); } catch (ignore) {}
      }
      error = cancelledError(reason);
      settle(operation, error);
      return true;
    }

    function start(target, priority, callback) {
      var operation = {
        id: operationId += 1,
        generation: generation += 1,
        identity: identityOf(target),
        target: target,
        priority: priority,
        callbacks: [],
        request: null,
        settled: false
      };
      active = operation;
      operation.callbacks.push(callback);
      if (metrics && typeof metrics.beginRealAssFetch === 'function') { metrics.beginRealAssFetch(); }
      try {
        operation.request = transportLoad(target, function (error, content) {
          if (destroyed || active !== operation || operation.generation !== generation) { return; }
          settle(operation, error || null, content);
        });
      } catch (error) {
        settle(operation, error);
      }
      notify();
      return true;
    }

    function request(target, requestOptions, callback) {
      var identity = identityOf(target);
      var priority = priorityOf(requestOptions);
      var cachedMatch;
      if (destroyed) { call(callback, cancelledError('ASS subtitle prefetch destroyed')); return false; }
      if (!identity) { call(callback, cancelledError('ASS subtitle prefetch identity missing')); return false; }
      cachedMatch = cached && cached.identity === identity;
      if (cachedMatch) { call(callback, null, cached.content); return true; }
      if (active && active.identity === identity) {
        if (priority === 'foreground') { active.priority = priority; }
        if (typeof callback === 'function') { active.callbacks.push(callback); }
        notify();
        return true;
      }
      if (active) {
        if (active.priority === 'foreground' && priority !== 'foreground') {
          call(callback, cancelledError('foreground ASS subtitle request owns prefetch')); return false;
        }
        cancelActive('ASS subtitle prefetch replaced');
      }
      cached = null;
      return start(target, priority, callback);
    }

    function claim(identity, callback) {
      var value;
      var targetIdentity = String(identity || '');
      if (destroyed) { call(callback, cancelledError('ASS subtitle prefetch destroyed')); return null; }
      if (active && active.identity === targetIdentity) {
        active.priority = 'foreground';
        if (typeof callback === 'function') { active.callbacks.push(callback); return true; }
        return null;
      }
      if (!cached || cached.identity !== targetIdentity) {
        call(callback, null, null);
        return null;
      }
      value = { identity: cached.identity, content: cached.content };
      cached = null;
      notify();
      call(callback, null, value.content);
      return value;
    }

    function cancel(reason) {
      var hadCache = !!cached;
      var changed = cancelActive(reason || 'ASS subtitle prefetch cancelled');
      cached = null;
      if (changed || hadCache) { notify(); }
      return changed;
    }

    function cancelSpeculative(reason) {
      var changed = false;
      var hadCache = !!cached;
      if (active && active.priority === 'speculative') {
        changed = cancelActive(reason || 'speculative ASS subtitle prefetch cancelled');
      }
      if (cached) { cached = null; changed = true; }
      if (changed || hadCache) { notify(); }
      return changed;
    }

    function snapshot() {
      return {
        active: !!active,
        activeIdentity: active ? active.identity : '',
        activePriority: active ? active.priority : '',
        cached: !!cached,
        cachedIdentity: cached ? cached.identity : '',
        destroyed: destroyed
      };
    }

    function destroy() {
      if (destroyed) { return; }
      cancelActive('ASS subtitle prefetch destroyed');
      cached = null;
      destroyed = true;
      notify();
    }

    return {
      cancel: cancel,
      cancelSpeculative: cancelSpeculative,
      claim: claim,
      destroy: destroy,
      peek: function (identity) { return !!cached && cached.identity === String(identity || ''); },
      request: request,
      loadPlayback: function (ratingKey, session, preferences, callback) {
        if (!values.PlexClient || typeof values.PlexClient.loadPlayback !== 'function') {
          call(callback, new Error('ASS subtitle playback transport unavailable'));
          return null;
        }
        return values.PlexClient.loadPlayback(values.config || {}, ratingKey, session, preferences || {}, callback);
      },
      snapshot: snapshot
    };
  }

  return { create: create };
}));
