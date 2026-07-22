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

  function fail(state, offline, position) {
    var next = clone(state);
    next.position = Math.max(0, Number(position || next.position || 0));
    if (offline) {
      next.status = 'waiting-network';
    } else if (next.index + 1 < next.plan.length) {
      next.index += 1;
      next.status = 'retrying';
    } else {
      next.status = 'failed';
    }
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
    next.index = 0;
    next.status = 'retrying';
    next.attempts = 0;
    return next;
  }

  function rebuild(state, position) {
    var next = clone(state);
    next.position = Math.max(0, Number(position || 0));
    if (current(next) && current(next).kind === 'direct-play' && next.index + 1 < next.plan.length) {
      next.index += 1;
    }
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
    fail: fail,
    online: online,
    playing: playing,
    rebuild: rebuild,
    retry: retry,
    start: start
  };
}));
