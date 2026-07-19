(function (root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffSearchModel = factory();
  }
}(this, function () {
  'use strict';

  var letterRows = [
    ['1','2','3','4','5','6','7','8','9','0'],
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l'],
    ['shift','z','x','c','v','b','n','m','backspace'],
    ['clear','space']
  ];
  var symbolRows = [
    ['-','_','.',':',"'",'&'],
    ['!','?','+','/','(',')'],
    ['shift','backspace'],
    ['clear','space']
  ];

  function copyFocus(focus) {
    return { zone: focus.zone, row: focus.row, column: focus.column, index: focus.index };
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(value, maximum));
  }

  function applyKey(query, key, symbolMode) {
    var next = String(query || '');
    if (key === 'shift') {
      return { query: next, symbolMode: !symbolMode };
    }
    if (key === 'backspace') {
      next = next.slice(0, -1);
    } else if (key === 'clear') {
      next = '';
    } else if (key === 'space') {
      next += ' ';
    } else if (next.length < 80) {
      next += key;
    }
    return { query: next, symbolMode: !!symbolMode };
  }

  function normalizedText(value) {
    return String(value || '').toLowerCase()
      .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i').replace(/[òóôõö]/g, 'o')
      .replace(/[ùúûü]/g, 'u').replace(/[ç]/g, 'c')
      .replace(/[^a-z0-9]+/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  function relevantCloudItems(query, items) {
    var terms = normalizedText(query).split(/\s+/).filter(function (term) { return !!term; });
    var seen = {};
    return (items || []).filter(function (item, index) {
      var title = normalizedText(item && item.title);
      var guid = String(item && item.guid || '');
      var titleMatch = terms.length && terms.every(function (term) { return title.indexOf(term) !== -1; });
      var rankedAlias = index === 0 && Number(item && item.score || 0) >= 0.5;
      var relevant = !!guid && (titleMatch || rankedAlias);
      if (!relevant || seen[guid]) { return false; }
      seen[guid] = true;
      return true;
    });
  }

  function mergeLocalResults(localItems, resolvedItems) {
    var seen = {};
    var result = [];
    (localItems || []).concat(resolvedItems || []).forEach(function (item) {
      var key = String(item && item.ratingKey || '');
      if (!key || seen[key]) { return; }
      seen[key] = true;
      result.push(item);
    });
    result.sort(function (left, right) {
      var leftTitle = normalizedText(left && left.title);
      var rightTitle = normalizedText(right && right.title);
      return leftTitle < rightTitle ? -1 : (leftTitle > rightTitle ? 1 : 0);
    });
    return result;
  }

  function measureLayout(containerWidth, containerHeight, cardWidth, cardHeight, resultCount) {
    var columns = Math.max(1, Math.floor(Number(containerWidth || 0) / Math.max(1, Number(cardWidth || 1))));
    var visibleRows = Math.max(1, Math.ceil(Number(containerHeight || 0) / Math.max(1, Number(cardHeight || 1))));
    return {
      columns: columns,
      visibleRows: visibleRows,
      totalRows: Math.ceil(Math.max(0, Number(resultCount || 0)) / columns)
    };
  }

  function virtualWindow(focusIndex, resultCount, columns, visibleRows, overscanRows, currentVisibleStartRow) {
    var count = Math.max(0, Number(resultCount || 0));
    var columnCount = Math.max(1, Number(columns || 1));
    var rowsVisible = Math.max(1, Number(visibleRows || 1));
    var overscan = Math.max(0, Number(overscanRows || 0));
    var totalRows = Math.ceil(count / columnCount);
    var maximumStart = Math.max(0, totalRows - rowsVisible);
    var visibleStart = clamp(Number(currentVisibleStartRow || 0), 0, maximumStart);
    var focusRow;
    var renderStartRow;
    var renderEndRow;
    if (!count) {
      return { start: 0, end: 0, visibleStartRow: 0, offsetRows: 0 };
    }
    focusIndex = clamp(Number(focusIndex || 0), 0, count - 1);
    focusRow = Math.floor(focusIndex / columnCount);
    if (focusRow < visibleStart) {
      visibleStart = focusRow;
    } else if (focusRow >= visibleStart + rowsVisible) {
      visibleStart = focusRow - rowsVisible + 1;
    }
    visibleStart = clamp(visibleStart, 0, maximumStart);
    renderStartRow = Math.max(0, visibleStart - overscan);
    renderEndRow = Math.min(totalRows, visibleStart + rowsVisible + overscan);
    return {
      start: renderStartRow * columnCount,
      end: Math.min(count, renderEndRow * columnCount),
      visibleStartRow: visibleStart,
      offsetRows: visibleStart - renderStartRow
    };
  }

  function move(focus, direction, layout) {
    var next = copyFocus(focus);
    var rows = layout.keyboardRows || [];
    var columns = layout.resultColumns || 1;
    var candidate;

    if (next.zone === 'nav') {
      if (direction === 'down' && rows.length) {
        next.zone = 'keyboard';
        next.row = 0;
        next.column = clamp(next.column, 0, rows[0] - 1);
        next.index = 0;
      }
      return next;
    }

    if (next.zone === 'keyboard') {
      if (direction === 'left') {
        next.column = Math.max(0, next.column - 1);
      } else if (direction === 'right') {
        next.column = Math.min(rows[next.row] - 1, next.column + 1);
      } else if (direction === 'up') {
        if (next.row === 0) {
          next.zone = 'nav';
        } else {
          next.row -= 1;
          next.column = clamp(next.column, 0, rows[next.row] - 1);
        }
      } else if (direction === 'down') {
        if (next.row < rows.length - 1) {
          next.row += 1;
          next.column = clamp(next.column, 0, rows[next.row] - 1);
        } else if (layout.resultCount > 0) {
          next.zone = 'results';
          next.row = 0;
          next.column = clamp(next.column, 0, Math.min(columns, layout.resultCount) - 1);
          next.index = next.column;
        }
      }
      return next;
    }

    if (next.zone === 'results') {
      if (direction === 'left' && next.column > 0) {
        next.column -= 1;
        next.index -= 1;
      } else if (direction === 'right' && next.column < columns - 1 && next.index + 1 < layout.resultCount) {
        next.column += 1;
        next.index += 1;
      } else if (direction === 'up') {
        candidate = next.index - columns;
        if (candidate >= 0) {
          next.index = candidate;
          next.row -= 1;
        } else if (rows.length) {
          next.zone = 'keyboard';
          next.row = rows.length - 1;
          next.column = clamp(next.column, 0, rows[next.row] - 1);
          next.index = 0;
        }
      } else if (direction === 'down') {
        candidate = next.index + columns;
        if (candidate < layout.resultCount) {
          next.index = candidate;
          next.row += 1;
          next.column = candidate % columns;
        }
      }
    }
    return next;
  }

  return {
    letterRows: letterRows,
    symbolRows: symbolRows,
    applyKey: applyKey,
    relevantCloudItems: relevantCloudItems,
    mergeLocalResults: mergeLocalResults,
    measureLayout: measureLayout,
    virtualWindow: virtualWindow,
    move: move
  };
}));
