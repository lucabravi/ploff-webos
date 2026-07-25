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
  var pending = null;
  var writing = false;
  var idleCallbacks = [];
  var activeRequest = null;
  var serviceRoot = null;

  function call(method, parameters, onSuccess, onFailure) {
    var request;
    try {
      activeRequest = true;
      request = serviceRoot.webOS.service.request(DB_URI, {
        method: method,
        parameters: parameters,
        onSuccess: function (response) {
          activeRequest = null;
          onSuccess(response || {});
        },
        onFailure: function (error) {
          activeRequest = null;
          onFailure(error || {});
        }
      });
      if (activeRequest) { activeRequest = request || true; }
    } catch (error) {
      activeRequest = null;
      onFailure(error);
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
    pending = payload || '';
    writeNext();
  }

  function privateStorage(baseStorage, initialPayload) {
    var payload = String(initialPayload || '');
    return {
      getItem: function (key) {
        if (key === AUTH_KEY) { return payload || null; }
        return baseStorage && baseStorage.getItem ? baseStorage.getItem(key) : null;
      },
      setItem: function (key, value) {
        if (key === AUTH_KEY) {
          payload = String(value || '');
          queue(payload);
          return;
        }
        if (baseStorage && baseStorage.setItem) { baseStorage.setItem(key, value); }
      },
      removeItem: function (key) {
        if (key === AUTH_KEY) {
          payload = '';
          queue('');
          return;
        }
        if (baseStorage && baseStorage.removeItem) { baseStorage.removeItem(key); }
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

    function done(storage, mode) {
      if (completed) { return; }
      completed = true;
      callback(storage, mode);
    }

    try { legacyPayload = String(baseStorage && baseStorage.getItem(AUTH_KEY) || ''); } catch (ignore) {}
    if (!hasDb8(rootObject)) {
      done(baseStorage, 'browser');
      return;
    }

    serviceRoot = rootObject;
    call('putKind', {
      id: KIND,
      owner: OWNER,
      private: true,
      sync: false,
      indexes: [{ name: 'slot', props: [{ name: 'slot' }] }]
    }, load, load);

    function load() {
      call('find', {
        query: {
          from: KIND,
          where: [{ prop: 'slot', op: '=', val: SLOT }],
          limit: 1
        }
      }, function (response) {
        var results = response.results || [];
        var storedPayload = results.length ? String(results[0].payload || '') : '';
        var storage = privateStorage(baseStorage, storedPayload || legacyPayload);
        if (baseStorage && baseStorage.removeItem) { baseStorage.removeItem(AUTH_KEY); }
        if (!storedPayload && legacyPayload) { queue(legacyPayload); }
        done(storage, 'db8-private');
      }, function () {
        var storage = privateStorage(baseStorage, legacyPayload);
        if (baseStorage && baseStorage.removeItem) { baseStorage.removeItem(AUTH_KEY); }
        serviceRoot = null;
        done(storage, 'session');
      });
    }
  }

  function whenIdle(callback) {
    if (!writing && pending === null && !activeRequest) { callback(); return; }
    idleCallbacks.push(callback);
  }

  return {
    AUTH_KEY: AUTH_KEY,
    KIND: KIND,
    prepare: prepare,
    whenIdle: whenIdle
  };
}));
