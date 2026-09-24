(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffMediaSourcePreference = factory(); }
}(this, function () {
  'use strict';

  var STORAGE_KEY = 'ploff.mediaSourcePreference.v1';

  function clean(value, limit) {
    return String(value || '').replace(/^\s+|\s+$/g, '').slice(0, limit || 240);
  }

  function read(storage) {
    var parsed;
    if (!storage || typeof storage.getItem !== 'function') { return {}; }
    try { parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}'); }
    catch (_error) { parsed = {}; }
    return parsed && typeof parsed === 'object' ? parsed : {};
  }

  function write(storage, state) {
    if (!storage || typeof storage.setItem !== 'function') { return state; }
    try { storage.setItem(STORAGE_KEY, JSON.stringify(state || {})); }
    catch (_error) {}
    return state;
  }

  function create(options) {
    var storage = options && options.storage;
    var state = read(storage);

    function get(guid) {
      var key = clean(guid, 500);
      return key && state[key] ? clean(state[key], 240) : '';
    }

    function set(guid, machineIdentifier) {
      var key = clean(guid, 500);
      var machine = clean(machineIdentifier, 240);
      if (!key) { return ''; }
      if (machine) { state[key] = machine; }
      else { delete state[key]; }
      write(storage, state);
      return machine;
    }

    function snapshot() {
      var result = {};
      Object.keys(state).forEach(function (key) { result[key] = clean(state[key], 240); });
      return result;
    }

    function replace(values) {
      var next = {};
      Object.keys(values || {}).slice(0, 512).forEach(function (key) {
        var guid = clean(key, 500);
        var machine = clean(values[key], 240);
        if (guid && machine) { next[guid] = machine; }
      });
      state = next;
      write(storage, state);
      return snapshot();
    }

    return { get: get, replace: replace, set: set, snapshot: snapshot };
  }

  return { STORAGE_KEY: STORAGE_KEY, create: create };
}));
