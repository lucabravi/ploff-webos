(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffLibraryTabPrefetch = factory(); }
}(this, function () {
  'use strict';

  function isArray(value) { return Object.prototype.toString.call(value) === '[object Array]'; }

  function copyObject(value) {
    var result = {};
    var key;
    if (!value || typeof value !== 'object') { return result; }
    for (key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) { result[key] = value[key]; }
    }
    return result;
  }

  function stableValue(value) {
    var result;
    var keys;
    var index;
    if (value === null || value === undefined) { return value; }
    if (isArray(value)) { return value.map(stableValue); }
    if (typeof value !== 'object') { return value; }
    result = {};
    keys = Object.keys(value).sort();
    for (index = 0; index < keys.length; index += 1) {
      result[keys[index]] = stableValue(value[keys[index]]);
    }
    return result;
  }

  function stableStringify(value) {
    return JSON.stringify(stableValue(value));
  }

  /*
   * Keep the response immutable from the grid's point of view without cloning
   * every nested Plex attribute. The lifecycle only consumes the top-level
   * item arrays; recent-group records are already copied by the client.
   */
  function copyResult(value) {
    var result;
    if (isArray(value)) {
      return value.map(function (item) {
        var copied = item && typeof item === 'object' ? copyObject(item) : item;
        if (copied && isArray(copied.items)) { copied.items = copied.items.slice(); }
        return copied;
      });
    }
    if (!value || typeof value !== 'object') { return value; }
    result = copyObject(value);
    if (isArray(result.items)) { result.items = result.items.slice(); }
    return result;
  }

  function create(options) {
    var values = options || {};
    var views = isArray(values.views) && values.views.length
      ? values.views.slice()
      : ['recommended', 'continue', 'recent', 'catalog', 'collections'];
    var maxConcurrent = Math.max(1, Number(values.maxConcurrent || 2));
    var maxEntries = Math.max(1, Number(values.maxEntries || 24));
    var entries = {};
    var order = [];
    var queue = [];
    var activeCount = 0;
    var destroyed = false;

    function sourceIdentity(request) {
      var custom;
      var library = request && request.library || {};
      var context = request && request.sourceContext || {};
      if (typeof values.sourceIdentity === 'function') {
        custom = values.sourceIdentity(library, context, request);
        if (custom !== undefined && custom !== null && String(custom)) { return String(custom); }
      }
      return String(context.serverMachineIdentifier || context.sourceId || library.sourceId || '');
    }

    function libraryIdentity(request) {
      var library = request && request.library || {};
      return String(library.key || library.ratingKey || library.sourceId || library.title || '');
    }

    function viewIdentity(request) {
      return String(request && request.viewKey || 'recommended');
    }

    function requestKey(request) {
      var library = request && request.library || {};
      return [
        sourceIdentity(request),
        libraryIdentity(request),
        stableStringify([library.virtualLibrary === true, library.memberSourceIds || []]),
        viewIdentity(request),
        stableStringify(request && request.query || {}),
        Math.max(0, Number(request && request.start || 0)),
        Math.max(0, Number(request && request.limit || 0))
      ].join('|');
    }

    function scopeKey(request) {
      return sourceIdentity(request) + '|' + libraryIdentity(request);
    }

    function libraryScope(request) {
      var library = request && request.library || {};
      var sourceId = String(library.sourceId || '');
      return sourceId ? 'source:' + sourceId : 'route:' + scopeKey(request);
    }

    function priorityOf(entry) {
      return Math.max(0, Number(entry && entry.request && entry.request.priority || 0));
    }

    function promotePriority(entry, request) {
      var priority = Math.max(0, Number(request && request.priority || 0));
      if (!entry || priority >= priorityOf(entry)) { return false; }
      entry.request.priority = priority;
      if (entry.state === 'queued') {
        removeFromQueue(entry);
        insertQueue(entry);
      }
      return true;
    }

    function compare(left, right) {
      var priority = priorityOf(left) - priorityOf(right);
      if (priority) { return priority; }
      return Number(left.sequence || 0) - Number(right.sequence || 0);
    }

    function removeFromQueue(entry) {
      var index = queue.indexOf(entry);
      if (index !== -1) { queue.splice(index, 1); }
    }

    function insertQueue(entry) {
      var low = 0;
      var high = queue.length;
      var middle;
      while (low < high) {
        middle = Math.floor((low + high) / 2);
        if (compare(entry, queue[middle]) < 0) { high = middle; }
        else { low = middle + 1; }
      }
      queue.splice(low, 0, entry);
    }

    function touch(entry) {
      var index = order.indexOf(entry.key);
      if (index !== -1) { order.splice(index, 1); }
      order.push(entry.key);
    }

    function evict() {
      var index;
      var key;
      var entry;
      for (index = 0; order.length > maxEntries && index < order.length; index += 1) {
        key = order[index];
        entry = entries[key];
        if (!entry || entry.state === 'ready') {
          order.splice(index, 1);
          index -= 1;
          if (entry) { delete entries[key]; }
        }
      }
    }

    function notify(entry, error, result) {
      var callbacks = entry.callbacks.slice();
      var index;
      entry.callbacks = [];
      for (index = 0; index < callbacks.length; index += 1) {
        if (callbacks[index].cancelled || typeof callbacks[index].callback !== 'function') { continue; }
        try {
          callbacks[index].callback(error || null, error ? null : copyResult(result));
        } catch (_callbackError) {}
      }
    }

    function notifyProgress(entry, error, result) {
      var callbacks = entry.callbacks.slice();
      var index;
      entry.hasProgress = !error;
      entry.progress = error ? null : copyResult(result);
      for (index = 0; index < callbacks.length; index += 1) {
        if (callbacks[index].cancelled || typeof callbacks[index].onProgress !== 'function') { continue; }
        try { callbacks[index].onProgress(error || null, error ? null : copyResult(entry.progress)); } catch (_callbackError) {}
      }
    }

    function settle(entry, error, result) {
      if (!entry || entry.cancelled || entry.state !== 'pending') { return; }
      activeCount = Math.max(0, activeCount - 1);
      entry.abort = null;
      entry.hasProgress = false;
      entry.progress = null;
      if (error) {
        delete entries[entry.key];
        var failedOrder = order.indexOf(entry.key);
        if (failedOrder !== -1) { order.splice(failedOrder, 1); }
        entry.state = 'error';
        notify(entry, error, null);
      } else {
        entry.state = 'ready';
        entry.result = copyResult(result);
        touch(entry);
        evict();
        notify(entry, null, entry.result);
      }
      pump();
    }

    function start(entry) {
      var settled = false;
      function done(error, result) {
        if (settled || entry.cancelled) { return; }
        settled = true;
        settle(entry, error, result);
      }
      function progress(error, result) {
        if (settled || entry.cancelled) { return; }
        notifyProgress(entry, error, result);
      }
      entry.state = 'pending';
      activeCount += 1;
      try {
        entry.abort = typeof values.load === 'function' ? values.load(entry.request, done, progress) : null;
      } catch (error) {
        done(error, null);
      }
      if (settled) { entry.abort = null; }
    }

    function pump() {
      var entry;
      if (destroyed) { return; }
      while (activeCount < maxConcurrent && queue.length) {
        entry = queue.shift();
        if (!entry || entry.cancelled || entries[entry.key] !== entry) { continue; }
        start(entry);
      }
    }

    function preemptBackgroundFor(entry) {
      var keys;
      var index;
      var candidate = null;
      var candidatePriority = -1;
      var priority = priorityOf(entry);
      if (priority > 0 || activeCount < maxConcurrent) { return; }
      keys = Object.keys(entries);
      for (index = 0; index < keys.length; index += 1) {
        if (entries[keys[index]] && entries[keys[index]].state === 'pending' &&
            priorityOf(entries[keys[index]]) > priority && priorityOf(entries[keys[index]]) > candidatePriority) {
          candidate = entries[keys[index]];
          candidatePriority = priorityOf(candidate);
        }
      }
      if (candidate) { cancelEntry(candidate); }
    }

    function cancelEntry(entry) {
      if (!entry || entry.cancelled) { return; }
      entry.cancelled = true;
      removeFromQueue(entry);
      if (entry.state === 'pending') { activeCount = Math.max(0, activeCount - 1); }
      if (entry.abort && entry.abort.abort) {
        try { entry.abort.abort(); } catch (_abortError) {}
      }
      entry.abort = null;
      entry.callbacks = [];
      entry.hasProgress = false;
      entry.progress = null;
      if (entries[entry.key] === entry) { delete entries[entry.key]; }
      var orderIndex = order.indexOf(entry.key);
      if (orderIndex !== -1) { order.splice(orderIndex, 1); }
      entry.state = 'cancelled';
    }

    function request(request, callback, onProgress) {
      var valuesRequest = copyObject(request || {});
      var key;
      var entry;
      var subscriber;
      if (destroyed) {
        if (typeof callback === 'function') { callback(new Error('Library tab prefetch is destroyed'), null); }
        return { abort: function () {} };
      }
      key = requestKey(valuesRequest);
      entry = entries[key];
      if (entry && entry.state === 'ready') {
        touch(entry);
        if (typeof callback === 'function') { callback(null, copyResult(entry.result)); }
        return { abort: function () {} };
      }
      if (!entry) {
        entry = {
          key: key,
          scope: libraryScope(valuesRequest),
          request: valuesRequest,
          state: 'queued',
          sequence: Date.now(),
          callbacks: [],
          abort: null,
          cancelled: false,
          hasProgress: false,
          progress: null,
          result: null
        };
        entries[key] = entry;
        insertQueue(entry);
      } else if (entry.state === 'queued') {
        if (!promotePriority(entry, valuesRequest)) {
          removeFromQueue(entry);
          insertQueue(entry);
        }
      } else { promotePriority(entry, valuesRequest); }
      if (typeof callback === 'function') {
        subscriber = { callback: callback, onProgress: typeof onProgress === 'function' ? onProgress : null, cancelled: false };
        entry.callbacks.push(subscriber);
        if (entry.hasProgress && subscriber.onProgress) {
          try { subscriber.onProgress(null, copyResult(entry.progress)); } catch (_progressError) {}
        }
      }
      preemptBackgroundFor(entry);
      pump();
      return {
        abort: function () {
          if (subscriber) { subscriber.cancelled = true; }
        }
      };
    }

    function queryForView(request, viewKey) {
      if (viewKey === request.activeViewKey && request.activeQuery) { return request.activeQuery; }
      if (typeof values.queryForView === 'function') { return values.queryForView(viewKey, request.library, request); }
      return {};
    }

    function limitForView(request, viewKey) {
      if (typeof values.limitForView === 'function') { return Math.max(0, Number(values.limitForView(viewKey, request.library, request) || 0)); }
      return viewKey === 'recommended' ? 0 : 30;
    }

    function ensure(ensureRequest) {
      var valuesRequest = ensureRequest || {};
      var sequence = [];
      var activeView = String(valuesRequest.activeViewKey || '');
      var index;
      var view;
      var tabRequest;
      if (destroyed || !valuesRequest.library || valuesRequest.library.offline === true || valuesRequest.library.globalPlaylists === true) { return false; }
      if (activeView && views.indexOf(activeView) !== -1) { sequence.push(activeView); }
      for (index = 0; index < views.length; index += 1) {
        view = String(views[index]);
        if (sequence.indexOf(view) === -1) { sequence.push(view); }
      }
      for (index = 0; index < sequence.length; index += 1) {
        tabRequest = {
          library: valuesRequest.library,
          sourceContext: valuesRequest.sourceContext || null,
          viewKey: sequence[index],
          query: queryForView(valuesRequest, sequence[index]),
          start: 0,
          limit: limitForView(valuesRequest, sequence[index]),
          priority: index === 0 ? 0 : 20
        };
        request(tabRequest, (function (viewKey, readyRequest) {
          return function (error, result) {
            if (!error && typeof valuesRequest.onReady === 'function') {
              try { valuesRequest.onReady(viewKey, result, readyRequest); } catch (_readyError) {}
            }
          };
        }(sequence[index], tabRequest)));
      }
      return true;
    }

    function cancelLibraryScopes(scopes, includeReady) {
      var keys = Object.keys(entries);
      var index;
      for (index = 0; index < keys.length; index += 1) {
        if (entries[keys[index]] && scopes[entries[keys[index]].scope] &&
            (includeReady || entries[keys[index]].state !== 'ready')) {
          cancelEntry(entries[keys[index]]);
        }
      }
      pump();
      return true;
    }

    function cancelLibrary(library, sourceContext) {
      var scopes = Object.create(null);
      scopes[libraryScope({ library: library, sourceContext: sourceContext || null })] = true;
      return cancelLibraryScopes(scopes, false);
    }

    function invalidateLibraries(requests) {
      var scopes = Object.create(null);
      (requests || []).forEach(function (request) {
        if (request && request.library) { scopes[libraryScope(request)] = true; }
      });
      return cancelLibraryScopes(scopes, true);
    }

    function invalidateLibrary(library, sourceContext) {
      return invalidateLibraries([{ library: library, sourceContext: sourceContext || null }]);
    }

    function cancelPending() {
      var keys = Object.keys(entries);
      var index;
      for (index = 0; index < keys.length; index += 1) {
        if (entries[keys[index]] && entries[keys[index]].state !== 'ready') { cancelEntry(entries[keys[index]]); }
      }
      pump();
      return true;
    }

    function clear() {
      var keys = Object.keys(entries);
      var index;
      for (index = 0; index < keys.length; index += 1) { cancelEntry(entries[keys[index]]); }
      entries = {};
      order = [];
      queue = [];
      return true;
    }

    function cached(request) {
      var entry = entries[requestKey(request || {})];
      if (!entry || entry.state !== 'ready') { return null; }
      touch(entry);
      return copyResult(entry.result);
    }

    function snapshot() {
      var keys = Object.keys(entries);
      var pending = 0;
      var ready = 0;
      keys.forEach(function (key) {
        if (entries[key].state === 'ready') { ready += 1; }
        else { pending += 1; }
      });
      return {
        active: activeCount,
        queued: queue.length,
        pending: pending,
        ready: ready,
        keys: order.slice()
      };
    }

    function destroy() {
      if (destroyed) { return; }
      destroyed = true;
      cancelPending();
      clear();
    }

    return {
      cached: cached,
      cancelLibrary: cancelLibrary,
      cancelPending: cancelPending,
      clear: clear,
      destroy: destroy,
      ensure: ensure,
      invalidateLibrary: invalidateLibrary,
      invalidateLibraries: invalidateLibraries,
      request: request,
      snapshot: snapshot
    };
  }

  return { create: create };
}));
