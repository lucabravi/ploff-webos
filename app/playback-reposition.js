(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffPlaybackReposition = factory();
  }
}(this, function () {
  'use strict';

  var DECODER_ROLLBACK_LIMIT_SECONDS = 15;
  var STARTUP_ADVANCE_SECONDS = 0.25;
  var SEEK_ADVANCE_SECONDS = 5;

  function create(options) {
    var values = options || {};
    var PlaybackClock = values.PlaybackClock;
    var PlayerSeekController = values.PlayerSeekController;
    var settlement = null;

    if (!PlaybackClock || !PlayerSeekController) {
      throw new Error('PlaybackReposition requires clock and seek policy capabilities');
    }

    function decide(decisionOptions) {
      return PlayerSeekController.decide(decisionOptions || {});
    }

    function reached(target, actual, tolerance) {
      return PlayerSeekController.reached(target, actual, tolerance);
    }

    function repair(repairOptions) {
      return PlayerSeekController.repair(repairOptions || {});
    }

    function clear() {
      settlement = null;
    }

    function arm(target, kind, holdReport, offsetBase) {
      var numericTarget = Number(target);
      var hls = offsetBase !== undefined;
      var offset = Number(offsetBase);
      if (!isFinite(numericTarget) || (hls && (kind !== 'seek' || offsetBase === null || offsetBase === '' ||
          !isFinite(offset) || offset < 0 || numericTarget < offset))) {
        settlement = null;
        return false;
      }
      settlement = {
        target: numericTarget,
        nativeOffset: hls ? offset : null,
        advanceSeconds: kind === 'startup' ? STARTUP_ADVANCE_SECONDS : SEEK_ADVANCE_SECONDS,
        holdReport: holdReport === true
      };
      return true;
    }

    function pending() {
      return settlement !== null;
    }

    function holdReport() {
      return !!(settlement && settlement.holdReport);
    }

    function settle(clock, settleOptions) {
      var values = settleOptions || {};
      var state = settlement;
      var native = Number(values.nativeTime);
      var offset = Number(values.offset || 0);
      var candidate;
      var rollback;
      var nextClock = clock;
      var availableRanges;
      if (!state || !isFinite(native)) {
        return { clock: nextClock, settled: false };
      }
      if (state.nativeOffset !== null) {
        // An in-buffer HLS seek may settle only within the source that was sought.
        // A new source origin needs its own transaction, never guessed compensation.
        if (values.directPlay === true || values.offset === null || values.offset === undefined ||
            values.offset === '' || !isFinite(offset) || offset !== state.nativeOffset) {
          settlement = null;
          return { clock: nextClock, settled: false };
        }
        if (values.nativeTime === null || values.nativeTime === undefined || values.nativeTime === '' || native < 0) {
          return { clock: nextClock, settled: false };
        }
        availableRanges = values.buffered || [];
      } else {
        if (values.directPlay !== true) { return { clock: nextClock, settled: false }; }
        if (!isFinite(offset) || offset < 0) { offset = 0; }
        availableRanges = values.seekable || [];
      }
      candidate = offset + native;
      rollback = state.target - candidate;
      // LG webOS may first report the requested seek target and only then expose the
      // earlier keyframe that the decoder actually selected. Adopt one bounded
      // rollback evidenced by DP seekability or the active HLS source's buffer.
      if (rollback > 0.05 && rollback <= DECODER_ROLLBACK_LIMIT_SECONDS &&
          PlayerSeekController.buffered(availableRanges, native, 0.25)) {
        nextClock = PlaybackClock.anchor(nextClock, candidate);
        nextClock = PlaybackClock.freeze(nextClock, false);
        settlement = null;
        return { clock: nextClock, settled: true };
      }
      if (candidate >= state.target + state.advanceSeconds || rollback > DECODER_ROLLBACK_LIMIT_SECONDS) {
        settlement = null;
      }
      return { clock: nextClock, settled: false };
    }

    return {
      arm: arm,
      clear: clear,
      decide: decide,
      holdReport: holdReport,
      pending: pending,
      reached: reached,
      repair: repair,
      settle: settle
    };
  }

  return { create: create };
}));
