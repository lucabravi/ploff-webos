(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffPlaybackRecovery = factory();
  }
}(this, function () {
  'use strict';

  function clone(state) {
    return {
      plan: state.plan,
      index: state.index,
      status: state.status,
      position: state.position,
      attempts: state.attempts
    };
  }

  function create(plan) {
    return { plan: plan || [], index: 0, status: 'idle', position: 0, attempts: 0 };
  }

  function start(state, position) {
    var next = clone(state);
    next.status = 'loading';
    next.position = Math.max(0, Number(position || 0));
    next.attempts += 1;
    return next;
  }

  function incompatibility(error, source) {
    var code = Number(error && error.code || 0);
    if (source === 'native' && code === 3) { return 'media-decode'; }
    if (source === 'native' && code === 4) { return 'media-source-unsupported'; }
    if (source !== 'prepare' && source !== 'rebuild') { return ''; }
    // Transport error codes and incidental words ("decoder timeout") are not MediaError evidence.
    return /^(unsupported (codec|container|format|direct playback)|(?:codec|container|format) (?:is )?not supported)$/i.test(String(error && error.message || '')) ? 'unsupported-format' : '';
  }

  function fallback(state, offline, position, error, source) {
    var next = failCurrent(state, offline, position);
    if (!offline && (incompatibility(error, source) || (current(state) && current(state).kind === 'transcode' && error)) && next.index + 1 < next.plan.length) {
      next.index += 1;
      next.status = 'retrying';
    }
    return next;
  }

  function failCurrent(state, offline, position) {
    var next = clone(state);
    var target = position === undefined || position === null ? next.position : position;
    next.position = Math.max(0, Number(target || 0));
    next.status = offline ? 'waiting-network' : 'failed';
    return next;
  }

  function online(state) {
    var next = clone(state);
    if (next.status === 'waiting-network') { next.status = 'retrying'; }
    return next;
  }

  function playing(state) {
    var next = clone(state);
    next.status = 'playing';
    return next;
  }

  function retry(state) {
    var next = clone(state);
    next.status = 'retrying';
    next.attempts = 0;
    return next;
  }

  function rebuild(state, position) {
    var next = clone(state);
    next.position = Math.max(0, Number(position || 0));
    next.status = 'retrying';
    return next;
  }

  function current(state) {
    return state && state.plan[state.index] || null;
  }

  function canRetry(state) {
    return !!(state && state.plan && state.plan.length);
  }

  return {
    canRetry: canRetry,
    create: create,
    current: current,
    fail: failCurrent,
    failCurrent: failCurrent,
    fallback: fallback,
    incompatibility: incompatibility,
    online: online,
    playing: playing,
    rebuild: rebuild,
    retry: retry,
    start: start
  };
}));
