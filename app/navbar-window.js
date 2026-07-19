(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffNavbarWindow = factory();
  }
}(this, function () {
  'use strict';

  function normalizedWidths(values) {
    return (values || []).map(function (value) {
      var width = Number(value);
      return isFinite(width) && width > 0 ? width : 1;
    });
  }

  function endFor(widths, viewportWidth, start) {
    var width = 0;
    var end = start;
    while (end < widths.length) {
      if (end > start && width + widths[end] > viewportWidth) { break; }
      width += widths[end];
      end += 1;
    }
    return end;
  }

  function calculate(values, availableWidth, focusedIndex, previousStart) {
    var widths = normalizedWidths(values);
    var viewportWidth = Math.max(1, Number(availableWidth) || 1);
    var focus;
    var start;
    var end;
    if (!widths.length) {
      return { start: 0, end: 0, canScrollLeft: false, canScrollRight: false };
    }
    focus = Math.max(0, Math.min(widths.length - 1, Number(focusedIndex) || 0));
    start = Math.max(0, Math.min(widths.length - 1, Number(previousStart) || 0));
    if (focus < start) { start = focus; }
    end = endFor(widths, viewportWidth, start);
    while (focus >= end && start < focus) {
      start += 1;
      end = endFor(widths, viewportWidth, start);
    }
    return {
      start: start,
      end: end,
      canScrollLeft: start > 0,
      canScrollRight: end < widths.length
    };
  }

  return { calculate: calculate };
}));
