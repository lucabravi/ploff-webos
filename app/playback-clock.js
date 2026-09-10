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

  function optionalNumber(value) {
    var numeric;
    if (value === null || value === undefined || value === '') { return null; }
    numeric = Number(value);
    return isFinite(numeric) ? numeric : null;
  }

  function assessBufferResume(checkpoint, offsetBase, nativeTime, options) {
    var source = checkpoint || {};
    var values = options || {};
    var target = optionalNumber(source.absoluteTime);
    var checkpointNative = optionalNumber(source.nativeTime);
    var checkpointOffset = optionalNumber(source.offsetBase);
    var offset = optionalNumber(offsetBase);
    var native = optionalNumber(nativeTime);
    var backwardTolerance = Math.max(0, Number(values.backwardTolerance || 0));
    var forwardLimit = Math.max(backwardTolerance, Number(values.forwardLimit || backwardTolerance));
    var candidate;
    var delta;
    var reason = 'accepted';
    var accepted = true;
    if (target === null || checkpointNative === null || checkpointOffset === null || offset === null || native === null) {
      accepted = false;
      reason = 'invalid-sample';
      candidate = target === null ? null : target;
      delta = null;
    } else {
      candidate = Math.max(0, offset + native);
      delta = candidate - target;
      if (Math.abs(offset - checkpointOffset) > 0.05) {
        accepted = false;
        reason = 'offset-changed';
      } else if (Math.abs(offset) > forwardLimit && Math.abs(native - target) <= forwardLimit &&
          Math.abs(native - checkpointNative) > forwardLimit) {
        accepted = false;
        reason = 'native-domain-flip';
      } else if (delta < -backwardTolerance) {
        accepted = false;
        reason = 'backward-jump';
      } else if (delta > forwardLimit) {
        accepted = false;
        reason = 'forward-jump';
      }
    }
    return {
      accepted: accepted,
      reason: reason,
      target: target,
      candidate: candidate,
      delta: delta,
      nativeTime: native,
      offsetBase: offset
    };
  }

  return {
    anchor: anchor,
    assessBufferResume: assessBufferResume,
    create: create,
    freeze: freeze,
    observe: observe,
    position: position
  };
}));
