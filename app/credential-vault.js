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
  var FIND_LIMIT = 500;
  var pending = null;
  var pendingCleanupIds = [];
  var writing = false;
  var idleCallbacks = [];
  var activeRequest = null;
  var serviceRoot = null;
  var activeRecordId = '';

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

  function revisionOf(record) {
    var value = Number(record && record._rev);
    return isFinite(value) ? value : -1;
  }

  function validCredentialRecord(record) {
    return !!(record && String(record.payload || ''));
  }

  function newerRecord(candidate, selected) {
    var candidateRev;
    var selectedRev;
    var candidateId;
    var selectedId;
    if (!selected) { return true; }
    candidateRev = revisionOf(candidate);
    selectedRev = revisionOf(selected);
    if (candidateRev !== selectedRev) { return candidateRev > selectedRev; }
    candidateId = String(candidate && candidate._id || '');
    selectedId = String(selected && selected._id || '');
    if (candidateId && selectedId && candidateId !== selectedId) { return candidateId > selectedId; }
    return false;
  }

  function selectPrimaryRecord(results) {
    var selected = null;
    var index;
    var record;
    for (index = 0; index < results.length; index += 1) {
      record = results[index];
      if (!validCredentialRecord(record)) { continue; }
      if (newerRecord(record, selected)) { selected = record; }
    }
    return selected;
  }

  function cleanupIdsFor(results, selected) {
    var selectedId = String(selected && selected._id || '');
    var ids = [];
    var seen = {};
    var index;
    var id;
    for (index = 0; index < results.length; index += 1) {
      id = String(results[index] && results[index]._id || '');
      if (!id || id === selectedId || seen[id]) { continue; }
      seen[id] = true;
      ids.push(id);
    }
    return ids;
  }

  function applySelectedRecord(selected) {
    activeRecordId = String(selected && selected._id || '');
  }

  function captureWriteResult(response) {
    var result = response && response.results && response.results[0];
    if (!result) { return; }
    if (result.id !== undefined && result.id !== null) { activeRecordId = String(result.id); }
  }

  function findPrimary(onSuccess, onFailure) {
    call('find', {
      query: {
        from: KIND,
        where: [{ prop: 'slot', op: '=', val: SLOT }],
        limit: FIND_LIMIT
      }
    }, onSuccess, onFailure);
  }

  function queueCleanup(ids) {
    var seen = {};
    var index;
    var id;
    for (index = 0; index < pendingCleanupIds.length; index += 1) { seen[pendingCleanupIds[index]] = true; }
    for (index = 0; index < ids.length; index += 1) {
      id = String(ids[index] || '');
      if (!id || id === activeRecordId || seen[id]) { continue; }
      seen[id] = true;
      pendingCleanupIds.push(id);
    }
    writeNext();
  }

  function finishIdle() {
    var callbacks;
    var index;
    if (writing || pending !== null || pendingCleanupIds.length || activeRequest) { return; }
    callbacks = idleCallbacks.slice();
    idleCallbacks = [];
    for (index = 0; index < callbacks.length; index += 1) { callbacks[index](); }
  }

  function finishWrite() {
    writing = false;
    writeNext();
  }

  function verifyAfterPut() {
    findPrimary(function (response) {
      var results = response.results || [];
      var selected = selectPrimaryRecord(results);
      var ids;
      if (selected) { applySelectedRecord(selected); }
      ids = cleanupIdsFor(results, selected);
      if (ids.length) { queueCleanup(ids); }
      finishWrite();
    }, finishWrite);
  }

  function persistPayload(payload) {
    var object;
    if (!payload) {
      call('del', {
        query: { from: KIND, where: [{ prop: 'slot', op: '=', val: SLOT }] },
        purge: true
      }, function () {
        activeRecordId = '';
        pendingCleanupIds = [];
        finishWrite();
      }, finishWrite);
      return;
    }

    if (activeRecordId) {
      object = { _id: activeRecordId, slot: SLOT, payload: payload };
      call('merge', { objects: [object] }, function (response) {
        captureWriteResult(response);
        finishWrite();
      }, finishWrite);
      return;
    }

    call('put', {
      objects: [{ _kind: KIND, slot: SLOT, payload: payload }]
    }, function (response) {
      captureWriteResult(response);
      verifyAfterPut();
    }, finishWrite);
  }

  function cleanupNext() {
    var ids = [];
    var id;
    while (pendingCleanupIds.length) {
      id = pendingCleanupIds.shift();
      if (id && id !== activeRecordId) { ids.push(id); }
    }
    if (!ids.length) { finishWrite(); return; }
    call('del', { ids: ids, purge: true }, finishWrite, finishWrite);
  }

  function writeNext() {
    var payload;
    if (writing || !serviceRoot) { finishIdle(); return; }
    if (pending !== null) {
      payload = pending;
      pending = null;
      writing = true;
      persistPayload(payload);
      return;
    }
    if (pendingCleanupIds.length) {
      writing = true;
      cleanupNext();
      return;
    }
    finishIdle();
  }

  function queue(payload) {
    if (!serviceRoot) {
      pending = null;
      pendingCleanupIds = [];
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
      activeRecordId = '';
      pendingCleanupIds = [];
      serviceRoot = null;
      storage = privateStorage(baseStorage, legacyPayload);
      removeLegacy();
      done(storage, 'session');
    }

    try { legacyPayload = String(baseStorage && baseStorage.getItem(AUTH_KEY) || ''); } catch (ignore) {}
    if (!hasDb8(rootObject)) {
      serviceRoot = null;
      activeRecordId = '';
      pendingCleanupIds = [];
      done(baseStorage, 'browser');
      return;
    }

    serviceRoot = rootObject;
    activeRecordId = '';
    pendingCleanupIds = [];
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
      findPrimary(function (response) {
        var results;
        var selected;
        var storedPayload;
        var storage;
        var duplicateIds;
        if (completed) { return; }
        results = response.results || [];
        selected = selectPrimaryRecord(results);
        storedPayload = selected ? String(selected.payload || '') : '';
        applySelectedRecord(selected);
        duplicateIds = cleanupIdsFor(results, selected);
        storage = privateStorage(baseStorage, storedPayload || legacyPayload);
        removeLegacy();
        if (duplicateIds.length) { queueCleanup(duplicateIds); }
        if (!storedPayload && legacyPayload) { queue(legacyPayload); }
        done(storage, 'db8-private');
      }, fallback);
    }
  }

  function whenIdle(callback) {
    if (!writing && pending === null && !pendingCleanupIds.length && !activeRequest) { callback(); return; }
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
