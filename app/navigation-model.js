(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffNavigationModel = factory();
  }
}(this, function () {
  'use strict';

  var STORAGE_KEY = 'ploff.libraryOrder.v1';
  var PREVIEW_DELAY_MS = 200;

  function moveLibrary(items, index, direction) {
    var result = (items || []).slice();
    var target = index + (direction < 0 ? -1 : 1);
    var current;
    if (!result[index] || result[index].kind !== 'library' || !result[target] || result[target].kind !== 'library') {
      return { items: result, index: index };
    }
    current = result[index];
    result[index] = result[target];
    result[target] = current;
    return { items: result, index: target };
  }

  function visibleItems(items, settings) {
    var values = settings || {};
    return (items || []).filter(function (item) {
      if (item.kind === 'watchlist') { return !!values.showWatchlist; }
      if (item.kind === 'playlists') { return !!values.showPlaylists; }
      return true;
    });
  }

  function restoreVisibleIndex(previousItems, nextItems, index) {
    var active = (previousItems || [])[index];
    var nextIndex = (nextItems || []).indexOf(active);
    if (nextIndex >= 0) { return nextIndex; }
    return Math.max(0, Math.min(Number(index) || 0, Math.max(0, (nextItems || []).length - 1)));
  }

  function load(storage) {
    try {
      var value = storage && storage.getItem(STORAGE_KEY);
      return value ? JSON.parse(value).map(String) : [];
    } catch (error) {
      return [];
    }
  }

  function save(storage, keys) {
    var value = Object.prototype.toString.call(keys) === '[object Array]' ? keys.map(String) : [];
    try { if (storage && storage.setItem) { storage.setItem(STORAGE_KEY, JSON.stringify(value)); } }
    catch (_error) {}
    return value;
  }

  function createPreviewScheduler(clock, delay, callback) {
    var timer = null;
    function cancel() {
      if (timer !== null) { clock.clearTimeout(timer); }
      timer = null;
    }
    function schedule(index) {
      cancel();
      timer = clock.setTimeout(function () {
        timer = null;
        callback(index);
      }, delay);
    }
    return { cancel: cancel, schedule: schedule };
  }

  return {
    PREVIEW_DELAY_MS: PREVIEW_DELAY_MS,
    STORAGE_KEY: STORAGE_KEY,
    createPreviewScheduler: createPreviewScheduler,
    load: load,
    moveLibrary: moveLibrary,
    restoreVisibleIndex: restoreVisibleIndex,
    save: save,
    visibleItems: visibleItems
  };
}));
