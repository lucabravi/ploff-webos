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
        kind: String(row.kind || ''),
        sourceId: String(row.sourceId || ''),
        serverMachineIdentifier: String(row.serverMachineIdentifier || ''),
        sectionKey: String(row.sectionKey || ''),
        sectionTitle: String(row.sectionTitle || ''),
        showLibraryBadge: row.showLibraryBadge === true,
        items: items.map(cloneObject)
      });
    });
    return normalized;
  }

  function applyRowPreferences(rows, enabledKinds, configurableKinds) {
    var source = Object.prototype.toString.call(rows) === '[object Array]' ? rows : [];
    var enabled = Object.prototype.toString.call(enabledKinds) === '[object Array]' ? enabledKinds : null;
    var configurable = Object.prototype.toString.call(configurableKinds) === '[object Array]' ? configurableKinds : null;
    var grouped = {};
    var unknown = [];
    var result = [];
    if (!enabled || !configurable) { return source.slice(); }
    configurable.forEach(function (kind) { grouped[String(kind)] = []; });
    source.forEach(function (row) {
      var kind = String(row && row.kind || '');
      if (configurable.indexOf(kind) === -1) { unknown.push(row); return; }
      if (enabled.indexOf(kind) !== -1) { grouped[kind].push(row); }
    });
    enabled.forEach(function (kind) {
      if (configurable.indexOf(kind) === -1 || !grouped[kind]) { return; }
      grouped[kind].forEach(function (row) { result.push(row); });
    });
    return result.concat(unknown);
  }

  function applyRowOrder(rows, orderTokens) {
    var source = Object.prototype.toString.call(rows) === '[object Array]' ? rows : [];
    var order = Object.prototype.toString.call(orderTokens) === '[object Array]' ? orderTokens : [];
    var ranks = {};
    var decorated = [];
    order.forEach(function (token, index) {
      token = String(token || '');
      if (token && !Object.prototype.hasOwnProperty.call(ranks, token)) { ranks[token] = index; }
    });
    source.forEach(function (row, index) {
      var tokens = [];
      var rank = order.length + index;
      var memberIds = row && Object.prototype.toString.call(row.memberSourceIds) === '[object Array]' ? row.memberSourceIds : [];
      if (row && row.kind === 'recent') {
        if (row.sourceId) { tokens.push('source:' + String(row.sourceId)); }
        memberIds.forEach(function (sourceId) { tokens.push('source:' + String(sourceId || '')); });
      } else if (row && row.kind) {
        tokens.push('kind:' + String(row.kind));
      }
      tokens.forEach(function (token) {
        if (Object.prototype.hasOwnProperty.call(ranks, token)) { rank = Math.min(rank, ranks[token]); }
      });
      decorated.push({ row: row, index: index, rank: rank });
    });
    decorated.sort(function (left, right) {
      if (left.rank !== right.rank) { return left.rank - right.rank; }
      return left.index - right.index;
    });
    return decorated.map(function (entry) { return entry.row; });
  }

  function mediaKey(item) {
    var machine;
    item = item || {};
    if (item.homeDisplayKey) { return item.homeDisplayKey; }
    machine = String(item.serverMachineIdentifier || '');
    if (item.ratingKey) { return (machine ? 'server:' + machine + '|' : '') + 'rating:' + String(item.ratingKey); }
    if (item.key) { return (machine ? 'server:' + machine + '|' : '') + 'key:' + String(item.key); }
    if (item.image) { return 'image:' + String(item.image); }
    return 'title:' + String(item.title || '') + '|' + String(item.meta || '') + '|' + String(item.detail || '');
  }

  function rowKey(row) {
    row = row || {};
    if (row.sourceId) { return 'source:' + String(row.sourceId) + '|' + String(row.shape || 'poster'); }
    if (row.serverMachineIdentifier && row.sectionKey) {
      return 'section:' + String(row.serverMachineIdentifier) + '|' + String(row.sectionKey) + '|' + String(row.shape || 'poster');
    }
    return String(row.title || '') + '|' + String(row.shape || 'poster');
  }


  function nullLike(value) {
    return value === null || typeof value === 'undefined' ||
      (typeof value === 'number' && !isFinite(value)) || typeof value === 'function' || typeof value === 'symbol';
  }

  function valueEqual(left, right) {
    var leftArray;
    var rightArray;
    var leftKeys;
    var rightKeys;
    var index;
    var key;
    if (left === right) { return true; }
    if (nullLike(left) || nullLike(right)) { return nullLike(left) && nullLike(right); }
    leftArray = Object.prototype.toString.call(left) === '[object Array]';
    rightArray = Object.prototype.toString.call(right) === '[object Array]';
    if (leftArray || rightArray) {
      if (!leftArray || !rightArray || left.length !== right.length) { return false; }
      for (index = 0; index < left.length; index += 1) {
        if (!valueEqual(left[index], right[index])) { return false; }
      }
      return true;
    }
    if (typeof left === 'object' || typeof right === 'object') {
      if (!left || !right || typeof left !== 'object' || typeof right !== 'object') { return false; }
      leftKeys = Object.keys(left);
      rightKeys = Object.keys(right);
      if (leftKeys.length !== rightKeys.length) { return false; }
      for (index = 0; index < leftKeys.length; index += 1) {
        key = leftKeys[index];
        if (!Object.prototype.hasOwnProperty.call(right, key) || !valueEqual(left[key], right[key])) { return false; }
      }
      return true;
    }
    return false;
  }

  function rowsEqual(left, right) {
    return valueEqual(left, right);
  }

  function cloneValue(value) {
    var copy;
    var key;
    if (Object.prototype.toString.call(value) === '[object Array]') { return value.map(cloneValue); }
    if (value && typeof value === 'object') {
      copy = {};
      for (key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) { copy[key] = cloneValue(value[key]); }
      }
      return copy;
    }
    return value;
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
    var previousRows = [];
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
            changed = !hasData || !rowsEqual(normalized, previousRows);
            if (changed) { previousRows = cloneValue(normalized); }
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
      previousRows = [];
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
    applyRowOrder: applyRowOrder,
    applyRowPreferences: applyRowPreferences,
    createPoller: createPoller,
    createRefreshCoordinator: createRefreshCoordinator,
    mediaKey: mediaKey,
    normalizeRows: normalizeRows,
    rowsEqual: rowsEqual,
    restoreFocus: restoreFocus,
    rowKey: rowKey,
    selectionKey: selectionKey
  };
}));
