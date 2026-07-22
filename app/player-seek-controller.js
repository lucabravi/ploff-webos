(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffPlayerSeekController = factory();
  }
}(this, function () {
  'use strict';

  function normalize(target, duration) {
    var value = Number(target);
    var maximum = Number(duration);
    if (!isFinite(value) || !isFinite(maximum) || maximum <= 0) { return null; }
    return Math.max(0, Math.min(maximum, value));
  }

  function buffered(ranges, nativeTime, tolerance) {
    var values = ranges || [];
    var target = Number(nativeTime);
    var margin = isFinite(Number(tolerance)) ? Math.max(0, Number(tolerance)) : 0.25;
    var index;
    var start;
    var end;
    if (!isFinite(target) || target < 0) { return false; }
    for (index = 0; index < values.length; index += 1) {
      start = Number(values[index] && values[index].start);
      end = Number(values[index] && values[index].end);
      if (!isFinite(start) || !isFinite(end)) { continue; }
      if (target >= start - margin && target <= end + margin) { return true; }
    }
    return false;
  }

  function decide(options) {
    var values = options || {};
    var target = normalize(values.target, values.duration);
    var offset = Number(values.offset || 0);
    var nativeDuration = Number(values.nativeDuration);
    var nativeTime;
    var availableRanges;
    if (target === null) { return null; }
    if (!isFinite(offset) || offset < 0) { offset = 0; }
    nativeTime = target - offset;
    availableRanges = values.directPlay ? values.seekable : values.buffered;
    if (values.forceRebuild || nativeTime < 0 ||
        (values.nativeDuration !== undefined && (!isFinite(nativeDuration) || nativeTime > nativeDuration)) ||
        !buffered(availableRanges, nativeTime, values.tolerance)) {
      return { operation: 'rebuild', target: target, nativeTime: null };
    }
    return { operation: 'native', target: target, nativeTime: nativeTime };
  }

  function repair() {
    return 'rebuild';
  }

  function reached(target, actual, tolerance) {
    var expected = Number(target);
    var observed = Number(actual);
    var margin = isFinite(Number(tolerance)) ? Math.max(0, Number(tolerance)) : 1;
    return isFinite(expected) && isFinite(observed) && Math.abs(expected - observed) <= margin;
  }

  return { buffered: buffered, decide: decide, normalize: normalize, reached: reached, repair: repair };
}));
