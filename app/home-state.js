(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffHomeState = factory();
  }
}(this, function () {
  'use strict';

  function cloneObject(source) {
    var copy = {};
    var key;
    source = source || {};
    for (key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) { copy[key] = source[key]; }
    }
    return copy;
  }

  function normalizeRows(rows) {
    var normalized = [];
    var source = Object.prototype.toString.call(rows) === '[object Array]' ? rows : [];
    source.forEach(function (row) {
      var items = row && Object.prototype.toString.call(row.items) === '[object Array]' ? row.items : [];
      if (!items.length) { return; }
      normalized.push({
        title: String(row.title || ''),
        shape: String(row.shape || 'poster'),
        showLibraryBadge: row.showLibraryBadge === true,
        items: items.map(cloneObject)
      });
    });
    return normalized;
  }

  function mediaKey(item) {
    item = item || {};
    if (item.ratingKey) { return 'rating:' + String(item.ratingKey); }
    if (item.key) { return 'key:' + String(item.key); }
    if (item.image) { return 'image:' + String(item.image); }
    return 'title:' + String(item.title || '') + '|' + String(item.meta || '') + '|' + String(item.detail || '');
  }

  function rowKey(row) {
    row = row || {};
    return String(row.title || '') + '|' + String(row.shape || 'poster');
  }

  function stableValue(value) {
    var keys;
    if (Object.prototype.toString.call(value) === '[object Array]') {
      return value.map(stableValue);
    }
    if (value && typeof value === 'object') {
      keys = Object.keys(value).sort();
      return keys.map(function (key) { return [key, stableValue(value[key])]; });
    }
    if (typeof value === 'undefined') { return null; }
    return value;
  }

  function fingerprintNormalizedRows(rows) {
    return JSON.stringify(stableValue(rows));
  }

  function fingerprintRows(rows) {
    return fingerprintNormalizedRows(normalizeRows(rows));
  }

  function selectionKey(rows, state) {
    var row;
    var item;
    if (!state || state.area !== 'media') { return ''; }
    row = rows && rows[state.rowIndex];
    item = row && row.items && row.items[state.column];
    return item ? JSON.stringify([rowKey(row), mediaKey(item)]) : '';
  }

  function restoreFocus(rows, previous, selectedKey) {
    var rowIndex;
    var column;
    var row;
    var target = previous || { area: 'media', navIndex: 0, rowIndex: 0, column: 0 };
    if (target.area === 'nav') {
      return { area: 'nav', navIndex: Math.max(0, Number(target.navIndex || 0)), rowIndex: 0, column: 0 };
    }
    if (selectedKey) {
      for (rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        for (column = 0; column < rows[rowIndex].items.length; column += 1) {
          if (selectionKey(rows, { area: 'media', rowIndex: rowIndex, column: column }) === selectedKey) {
            return { area: 'media', navIndex: 0, rowIndex: rowIndex, column: column };
          }
        }
      }
      for (rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        if (rows[rowIndex].items.length) {
          return { area: 'media', navIndex: 0, rowIndex: rowIndex, column: 0 };
        }
      }
    }
    rowIndex = Math.max(0, Math.min(Number(target.rowIndex || 0), Math.max(0, rows.length - 1)));
    row = rows[rowIndex];
    if (!row || !row.items.length) {
      for (rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        if (rows[rowIndex].items.length) { row = rows[rowIndex]; break; }
      }
    }
    column = row ? Math.max(0, Math.min(Number(target.column || 0), row.items.length - 1)) : 0;
    return { area: 'media', navIndex: 0, rowIndex: rowIndex, column: column };
  }

  function createRefreshCoordinator(loader, onResult) {
    var generation = 0;
    var loading = false;
    var pending = false;
    var hasData = false;
    var fingerprint = '';
    var activeRequest = null;

    function refresh() {
      var requestGeneration;
      var requestHandle;
      if (loading) { pending = true; return; }
      loading = true;
      requestGeneration = generation;
      try {
        requestHandle = loader(function (error, rows) {
          var normalized;
          var nextFingerprint;
          var changed;
          var initial;
          if (requestGeneration !== generation) { return; }
          activeRequest = null;
          loading = false;
          initial = !hasData;
          if (error) {
            onResult(error, [], false, initial);
          } else {
            normalized = normalizeRows(rows);
            nextFingerprint = fingerprintNormalizedRows(normalized);
            changed = !hasData || nextFingerprint !== fingerprint;
            fingerprint = nextFingerprint;
            hasData = true;
            onResult(null, normalized, changed, initial);
          }
          if (pending) {
            pending = false;
            refresh();
          }
        });
        if (requestGeneration === generation && loading) { activeRequest = requestHandle || null; }
        else if (requestGeneration !== generation && requestHandle && requestHandle.abort) { requestHandle.abort(); }
      } catch (error) {
        activeRequest = null;
        loading = false;
        onResult(error, [], false, !hasData);
      }
    }

    function reset() {
      var request = activeRequest;
      generation += 1;
      activeRequest = null;
      loading = false;
      pending = false;
      hasData = false;
      fingerprint = '';
      if (request && request.abort) { request.abort(); }
    }

    return {
      refresh: refresh,
      reset: reset,
      hasData: function () { return hasData; },
      isLoading: function () { return loading; }
    };
  }

  function createPoller(clock, options) {
    var timer = null;
    var interval = Math.max(1000, Number(options && options.interval || 10000));
    var canRefresh = options && options.canRefresh || function () { return false; };
    var isLoading = options && options.isLoading || function () { return false; };
    var refresh = options && options.refresh || function () {};

    function stop() {
      if (timer !== null) { clock.clearTimeout(timer); }
      timer = null;
    }

    function schedule() {
      stop();
      if (!canRefresh()) { return; }
      timer = clock.setTimeout(function () {
        timer = null;
        if (!canRefresh()) { return; }
        if (isLoading()) {
          schedule();
          return;
        }
        refresh();
      }, interval);
    }

    return {
      schedule: schedule,
      stop: stop,
      isScheduled: function () { return timer !== null; }
    };
  }

  return {
    createPoller: createPoller,
    createRefreshCoordinator: createRefreshCoordinator,
    fingerprintRows: fingerprintRows,
    mediaKey: mediaKey,
    normalizeRows: normalizeRows,
    restoreFocus: restoreFocus,
    rowKey: rowKey,
    selectionKey: selectionKey
  };
}));
