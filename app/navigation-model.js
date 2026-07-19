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

  function libraryKeys(items) {
    return (items || []).filter(function (item) { return item.kind === 'library' && item.key; })
      .map(function (item) { return String(item.key); });
  }

  function applyLibraryOrder(items, keys) {
    var order = Object.prototype.toString.call(keys) === '[object Array]' ? keys.map(String) : [];
    var libraries = (items || []).filter(function (item) { return item.kind === 'library'; });
    var originalOrder = libraryKeys(libraries);
    var fixedBefore = (items || []).filter(function (item) { return item.kind === 'home'; });
    var fixedAfter = (items || []).filter(function (item) { return item.kind !== 'home' && item.kind !== 'library'; });
    libraries.sort(function (left, right) {
      var leftIndex = order.indexOf(String(left.key));
      var rightIndex = order.indexOf(String(right.key));
      if (leftIndex < 0) { leftIndex = order.length; }
      if (rightIndex < 0) { rightIndex = order.length; }
      return leftIndex - rightIndex || originalOrder.indexOf(String(left.key)) - originalOrder.indexOf(String(right.key));
    });
    return fixedBefore.concat(libraries, fixedAfter);
  }

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
    if (storage && storage.setItem) { storage.setItem(STORAGE_KEY, JSON.stringify(value)); }
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
    STORAGE_KEY: STORAGE_KEY,
    applyLibraryOrder: applyLibraryOrder,
    createPreviewScheduler: createPreviewScheduler,
    libraryKeys: libraryKeys,
    load: load,
    moveLibrary: moveLibrary,
    save: save
  };
}));
