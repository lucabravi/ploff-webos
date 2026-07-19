(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffPlaybackClock = factory();
  }
}(this, function () {
  'use strict';

  function clone(state) {
    return {
      time: state.time,
      tolerance: state.tolerance,
      frozen: state.frozen,
      initialized: state.initialized
    };
  }

  function create(tolerance) {
    return {
      time: 0,
      tolerance: Math.max(0, Number(tolerance || 0)),
      frozen: false,
      initialized: false
    };
  }

  function anchor(state, absoluteTime) {
    var next = clone(state || create(2));
    next.time = Math.max(0, Number(absoluteTime || 0));
    next.initialized = true;
    return next;
  }

  function freeze(state, frozen) {
    var next = clone(state || create(2));
    next.frozen = !!frozen;
    return next;
  }

  function observe(state, offsetBase, nativeTime, allowBackward) {
    var next = clone(state || create(2));
    var base = Number(offsetBase || 0);
    var native = Number(nativeTime || 0);
    var candidate;
    var desynced = false;
    if (!isFinite(base) || !isFinite(native)) {
      return { state: next, time: next.time, desynced: false, correctionNativeTime: Math.max(0, next.time - (isFinite(base) ? base : 0)) };
    }
    candidate = Math.max(0, base + native);
    if (!next.frozen) {
      if (!next.initialized || allowBackward) {
        next.time = candidate;
        next.initialized = true;
      } else if (candidate < next.time) {
        desynced = next.time - candidate > next.tolerance;
      } else {
        next.time = candidate;
      }
    }
    return {
      state: next,
      time: next.time,
      desynced: desynced,
      correctionNativeTime: Math.max(0, next.time - base)
    };
  }

  function position(state) {
    return Math.max(0, Number(state && state.time || 0));
  }

  return { anchor: anchor, create: create, freeze: freeze, observe: observe, position: position };
}));
