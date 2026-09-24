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
    if (endFor(widths, viewportWidth, 0) === widths.length) {
      return { start: 0, end: widths.length, canScrollLeft: false, canScrollRight: false };
    }
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

  function trailingPreview(values, availableWidth, state, minimumVisibleWidth) {
    var widths = normalizedWidths(values);
    var viewportWidth = Math.max(1, Number(availableWidth) || 1);
    var minimum = Math.max(1, Number(minimumVisibleWidth) || 1);
    var start = Math.max(0, Number(state && state.start) || 0);
    var end = Math.max(start, Math.min(widths.length, Number(state && state.end) || 0));
    var occupied = 0;
    var visible;
    var index;
    if (!state || state.canScrollRight !== true || end >= widths.length) { return null; }
    for (index = start; index < end; index += 1) { occupied += widths[index]; }
    visible = viewportWidth - occupied;
    if (visible < minimum || visible >= widths[end]) { return null; }
    return {
      index: end,
      visibleWidth: visible,
      clippedWidth: widths[end] - visible
    };
  }

  function scrolledAlignment(values, availableWidth, state, trailingGutter) {
    var widths = normalizedWidths(values);
    var gutter = Math.max(0, Number(trailingGutter) || 0);
    var viewportWidth = Math.max(1, (Number(availableWidth) || 1) - gutter);
    var start = Math.max(0, Number(state && state.start) || 0);
    var end = Math.max(start, Math.min(widths.length, Number(state && state.end) || 0));
    var renderStart;
    var total = 0;
    var index;
    if (!state || state.canScrollLeft !== true || start === 0 || end === 0) { return null; }
    for (index = start; index < end; index += 1) { total += widths[index]; }
    renderStart = start;
    while (renderStart > 0 && total <= viewportWidth) {
      renderStart -= 1;
      total += widths[renderStart];
    }
    return { start: renderStart, leadingClip: Math.max(0, total - viewportWidth) };
  }

  function rightEdgeCorrection(containerRight, itemRight, trailingGutter) {
    var edge = Number(containerRight);
    var item = Number(itemRight);
    var gutter = Math.max(0, Number(trailingGutter) || 0);
    if (!isFinite(edge) || !isFinite(item)) { return 0; }
    return Math.max(0, item - (edge - gutter));
  }

  function shadowParts(value) {
    var source = String(value || '');
    var parts = [];
    var depth = 0;
    var start = 0;
    var index;
    var character;
    for (index = 0; index < source.length; index += 1) {
      character = source.charAt(index);
      if (character === '(') { depth += 1; }
      else if (character === ')') { depth = Math.max(0, depth - 1); }
      else if (character === ',' && depth === 0) {
        parts.push(source.slice(start, index));
        start = index + 1;
      }
    }
    parts.push(source.slice(start));
    return parts;
  }

  function focusShadowOutset(value) {
    var parts = shadowParts(value);
    var maximum = 0;
    var index;
    var lengths;
    var match;
    var lengthPattern;
    var horizontal;
    var blur;
    var spread;
    for (index = 0; index < parts.length; index += 1) {
      if (/\binset\b/i.test(parts[index])) { continue; }
      lengths = [];
      lengthPattern = /(-?\d+(?:\.\d+)?)px/g;
      match = lengthPattern.exec(parts[index]);
      while (match) {
        lengths.push(Number(match[1]) || 0);
        match = lengthPattern.exec(parts[index]);
      }
      horizontal = lengths[0] || 0;
      blur = Math.max(0, lengths[2] || 0);
      spread = lengths[3] || 0;
      maximum = Math.max(maximum, horizontal + blur * 1.5 + spread);
    }
    return Math.max(0, maximum);
  }

  return {
    calculate: calculate,
    trailingPreview: trailingPreview,
    scrolledAlignment: scrolledAlignment,
    rightEdgeCorrection: rightEdgeCorrection,
    focusShadowOutset: focusShadowOutset
  };
}));
