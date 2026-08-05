(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffCredentialVault = factory(); }
}(this, function () {
  'use strict';

  var AUTH_KEY = 'ploff.auth.v1';
  var DB_URI = 'luna://com.palm.db';
  var KIND = 'io.github.rhapsodos.ploff.auth:1';
  var OWNER = 'io.github.rhapsodos.ploff';
  var SLOT = 'primary';
  var PREPARE_TIMEOUT = 5000;
  var CALL_TIMEOUT = 5000;
  var pending = null;
  var writing = false;
  var idleCallbacks = [];
  var activeRequest = null;
  var serviceRoot = null;

  function call(method, parameters, onSuccess, onFailure) {
    var callRoot = serviceRoot;
    var operation = { request: null, timer: null, settled: false };

    function clearTimer() {
      if (operation.timer !== null && callRoot && callRoot.clearTimeout) { callRoot.clearTimeout(operation.timer); }
      operation.timer = null;
    }

    function closeOperation() {
      operation.settled = true;
      operation.timer = null;
      if (activeRequest === operation) { activeRequest = null; }
    }

    function settle(callback, payload) {
      if (operation.settled) { return; }
      clearTimer();
      closeOperation();
      callback(payload || {});
    }

    function timeout() {
      var request;
      if (operation.settled) { return; }
      request = operation.request;
      closeOperation();
      try { if (request && request.cancel) { request.cancel(); } }
      catch (_cancelError) {}
      onFailure({ timeout: true });
    }

    if (!callRoot || !callRoot.webOS || !callRoot.webOS.service) { onFailure({ unavailable: true }); return; }
    activeRequest = operation;
    try {
      operation.request = callRoot.webOS.service.request(DB_URI, {
        method: method,
        parameters: parameters,
        onSuccess: function (response) { settle(onSuccess, response); },
        onFailure: function (error) { settle(onFailure, error); }
      }) || null;
      if (!operation.settled && callRoot.setTimeout) { operation.timer = callRoot.setTimeout(timeout, CALL_TIMEOUT); }
    } catch (error) {
      settle(onFailure, error);
    }
  }

  function finishIdle() {
    var callbacks;
    var index;
    if (writing || pending !== null || activeRequest) { return; }
    callbacks = idleCallbacks.slice();
    idleCallbacks = [];
    for (index = 0; index < callbacks.length; index += 1) { callbacks[index](); }
  }

  function writeNext() {
    var payload;
    if (writing || pending === null || !serviceRoot) { finishIdle(); return; }
    payload = pending;
    pending = null;
    writing = true;
    call('del', {
      query: { from: KIND, where: [{ prop: 'slot', op: '=', val: SLOT }] },
      purge: true
    }, putPayload, putPayload);

    function putPayload() {
      if (!payload) {
        writing = false;
        writeNext();
        return;
      }
      call('put', {
        objects: [{ _kind: KIND, slot: SLOT, payload: payload }]
      }, complete, complete);
    }

    function complete() {
      writing = false;
      writeNext();
    }
  }

  function queue(payload) {
    if (!serviceRoot) {
      pending = null;
      finishIdle();
      return;
    }
    pending = payload || '';
    writeNext();
  }

  function privateStorage(baseStorage, initialPayload) {
    var payload = String(initialPayload || '');
    return {
      getItem: function (key) {
        if (key === AUTH_KEY) { return payload || null; }
        try { return baseStorage && baseStorage.getItem ? baseStorage.getItem(key) : null; }
        catch (_error) { return null; }
      },
      setItem: function (key, value) {
        if (key === AUTH_KEY) {
          payload = String(value || '');
          queue(payload);
          return;
        }
        try { if (baseStorage && baseStorage.setItem) { baseStorage.setItem(key, value); } }
        catch (_error) {}
      },
      removeItem: function (key) {
        if (key === AUTH_KEY) {
          payload = '';
          queue('');
          return;
        }
        try { if (baseStorage && baseStorage.removeItem) { baseStorage.removeItem(key); } }
        catch (_error) {}
      }
    };
  }

  function hasDb8(rootObject) {
    return !!(rootObject && rootObject.webOS && rootObject.webOS.service &&
      typeof rootObject.webOS.service.request === 'function');
  }

  function prepare(rootObject, baseStorage, callback) {
    var legacyPayload = '';
    var completed = false;
    var fallbackTimer = null;

    function clearFallbackTimer() {
      if (fallbackTimer !== null && rootObject && rootObject.clearTimeout) { rootObject.clearTimeout(fallbackTimer); }
      fallbackTimer = null;
    }

    function done(storage, mode) {
      if (completed) { return; }
      completed = true;
      clearFallbackTimer();
      callback(storage, mode);
    }

    function removeLegacy() {
      try { if (baseStorage && baseStorage.removeItem) { baseStorage.removeItem(AUTH_KEY); } }
      catch (_removeError) {}
    }

    function fallback() {
      var storage;
      if (completed) { return; }
      activeRequest = null;
      serviceRoot = null;
      storage = privateStorage(baseStorage, legacyPayload);
      removeLegacy();
      done(storage, 'session');
    }

    try { legacyPayload = String(baseStorage && baseStorage.getItem(AUTH_KEY) || ''); } catch (ignore) {}
    if (!hasDb8(rootObject)) {
      done(baseStorage, 'browser');
      return;
    }

    serviceRoot = rootObject;
    if (rootObject.setTimeout) { fallbackTimer = rootObject.setTimeout(fallback, PREPARE_TIMEOUT); }
    call('putKind', {
      id: KIND,
      owner: OWNER,
      private: true,
      sync: false,
      indexes: [{ name: 'slot', props: [{ name: 'slot' }] }]
    }, load, load);

    function load() {
      if (completed) { return; }
      call('find', {
        query: {
          from: KIND,
          where: [{ prop: 'slot', op: '=', val: SLOT }],
          limit: 1
        }
      }, function (response) {
        var results;
        var storedPayload;
        var storage;
        if (completed) { return; }
        results = response.results || [];
        storedPayload = results.length ? String(results[0].payload || '') : '';
        storage = privateStorage(baseStorage, storedPayload || legacyPayload);
        removeLegacy();
        if (!storedPayload && legacyPayload) { queue(legacyPayload); }
        done(storage, 'db8-private');
      }, fallback);
    }
  }

  function whenIdle(callback) {
    if (!writing && pending === null && !activeRequest) { callback(); return; }
    idleCallbacks.push(callback);
  }

  return {
    AUTH_KEY: AUTH_KEY,
    KIND: KIND,
    CALL_TIMEOUT: CALL_TIMEOUT,
    PREPARE_TIMEOUT: PREPARE_TIMEOUT,
    prepare: prepare,
    whenIdle: whenIdle
  };
}));
