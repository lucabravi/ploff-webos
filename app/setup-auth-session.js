(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffSetupAuthSession = factory(); }
}(this, function () {
  'use strict';

  var INITIAL_POLL_DELAY = 1500;
  var WAITING_POLL_DELAY = 2000;
  var TRANSIENT_ERROR_DELAY = 5000;
  var MIN_DEADLINE = 60000;

  function defaultNow() { return new Date().getTime(); }

  function copyPin(pin) {
    var expiresIn;
    if (!pin) { return null; }
    expiresIn = Number(pin.expiresIn || 0);
    if (!isFinite(expiresIn) || expiresIn < 0) { expiresIn = 0; }
    return {
      id: String(pin.id || ''),
      code: String(pin.code || ''),
      expiresIn: expiresIn
    };
  }

  function create(options) {
    var values = options || {};
    var timers = values.root || {};
    var now = values.now || defaultNow;
    var generation = 0;
    var active = false;
    var phase = 'idle';
    var purpose = '';
    var pin = null;
    var deadline = 0;
    var errorMessage = '';
    var timer = null;
    var request = null;

    function clearTimer() {
      if (timer !== null && timers.clearTimeout) { timers.clearTimeout.call(timers, timer); }
      timer = null;
    }

    function abortRequest() {
      if (request && request.abort) { request.abort(); }
      request = null;
    }

    function snapshot() {
      return {
        active: active,
        phase: phase,
        purpose: purpose,
        generation: generation,
        pin: copyPin(pin),
        deadline: deadline,
        error: errorMessage
      };
    }

    function publish() {
      if (values.onState) { values.onState(snapshot()); }
    }

    function isCurrent(currentGeneration) {
      return active && currentGeneration === generation;
    }

    function fail(currentGeneration, failure, terminal) {
      var safeError = failure instanceof Error ? failure : new Error(String(failure || 'Plex authentication failed'));
      if (currentGeneration !== generation) { return; }
      errorMessage = safeError.message;
      if (terminal) {
        active = false;
        phase = 'error';
        clearTimer();
        abortRequest();
      } else {
        phase = 'error';
      }
      publish();
      if (values.onError) { values.onError(safeError, snapshot()); }
      if (!terminal) { schedule(currentGeneration, TRANSIENT_ERROR_DELAY); }
    }

    function expire(currentGeneration) {
      if (!isCurrent(currentGeneration)) { return; }
      active = false;
      phase = 'expired';
      errorMessage = 'Plex PIN expired';
      pin = null;
      clearTimer();
      abortRequest();
      publish();
      if (values.onError) { values.onError(new Error(errorMessage), snapshot()); }
    }

    function poll(currentGeneration) {
      var callback;
      if (!isCurrent(currentGeneration) || !pin) { return; }
      if (now() >= deadline) { expire(currentGeneration); return; }
      phase = 'polling';
      errorMessage = '';
      publish();
      callback = function (pollError, result) {
        var token;
        if (!isCurrent(currentGeneration)) { return; }
        request = null;
        if (pollError) { fail(currentGeneration, pollError, false); return; }
        token = result && result.token;
        if (!token) {
          phase = 'waiting';
          errorMessage = '';
          publish();
          schedule(currentGeneration, WAITING_POLL_DELAY);
          return;
        }
        active = false;
        phase = 'authenticated';
        errorMessage = '';
        clearTimer();
        publish();
        if (values.onAuthenticated) { values.onAuthenticated(result, snapshot()); }
      };
      try {
        request = values.pollPin(pin.id, callback);
      } catch (pollError) {
        fail(currentGeneration, pollError, false);
      }
    }

    function schedule(currentGeneration, delay) {
      clearTimer();
      if (!isCurrent(currentGeneration)) { return; }
      timer = (timers.setTimeout || setTimeout).call(timers, function () {
        timer = null;
        poll(currentGeneration);
      }, delay);
    }

    function startPin(currentGeneration) {
      try {
        request = values.createPin(purpose, function (createError, createdPin) {
          if (!isCurrent(currentGeneration)) { return; }
          request = null;
          if (createError || !createdPin || !createdPin.id || !createdPin.code) {
            fail(currentGeneration, createError || new Error('Invalid Plex PIN response'), true);
            return;
          }
          pin = {
            id: String(createdPin.id),
            code: String(createdPin.code),
            expiresIn: Number(createdPin.expiresIn || 0)
          };
          deadline = now() + Math.max(MIN_DEADLINE, pin.expiresIn * 1000);
          phase = 'waiting';
          errorMessage = '';
          publish();
          schedule(currentGeneration, INITIAL_POLL_DELAY);
        });
      } catch (createError) {
        fail(currentGeneration, createError, true);
      }
    }

    function begin(nextPurpose) {
      generation += 1;
      clearTimer();
      abortRequest();
      active = true;
      phase = 'creating';
      purpose = String(nextPurpose || '');
      pin = null;
      deadline = 0;
      errorMessage = '';
      publish();
      startPin(generation);
      return true;
    }

    function cancel() {
      generation += 1;
      clearTimer();
      abortRequest();
      active = false;
      phase = 'idle';
      purpose = '';
      pin = null;
      deadline = 0;
      errorMessage = '';
      publish();
    }

    return {
      begin: begin,
      cancel: cancel,
      isActive: function () { return active; },
      snapshot: snapshot,
      state: snapshot
    };
  }

  return { create: create };
}));
