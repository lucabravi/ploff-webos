(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffSubtitleOffsetStore = factory();
  }
}(this, function () {
  'use strict';

  var STORAGE_KEY = 'ploff.subtitle-offsets.v1';

  function load(storage) {
    var value;
    try {
      value = JSON.parse(storage && storage.getItem(STORAGE_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch (error) {
      return {};
    }
  }

  function identity(serverId, partId, streamId) {
    if (!serverId || !partId || !streamId) { return ''; }
    return [serverId, partId, streamId].map(function (value) {
      return encodeURIComponent(String(value));
    }).join('|');
  }

  function save(storage, values) {
    var keys = Object.keys(values);
    if (!storage) { return false; }
    try {
      if (!keys.length && storage.removeItem) { storage.removeItem(STORAGE_KEY); }
      else { storage.setItem(STORAGE_KEY, JSON.stringify(values)); }
      return true;
    } catch (error) {
      return false;
    }
  }

  function get(storage, serverId, partId, streamId) {
    var key = identity(serverId, partId, streamId);
    var value;
    if (!key) { return 0; }
    value = Number(load(storage)[key]);
    return isFinite(value) ? Math.max(-600000, Math.min(600000, Math.round(value))) : 0;
  }

  function remove(storage, serverId, partId, streamId) {
    var key = identity(serverId, partId, streamId);
    var values;
    if (!key) { return false; }
    values = load(storage);
    delete values[key];
    return save(storage, values);
  }

  function set(storage, serverId, partId, streamId, offsetMs) {
    var key = identity(serverId, partId, streamId);
    var offset = Number(offsetMs);
    var values;
    if (!key || !isFinite(offset)) { return false; }
    offset = Math.max(-600000, Math.min(600000, Math.round(offset)));
    if (offset === 0) { return remove(storage, serverId, partId, streamId); }
    values = load(storage);
    values[key] = offset;
    return save(storage, values);
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    get: get,
    remove: remove,
    set: set
  };
}));
