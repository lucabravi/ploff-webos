(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffPlaybackSession = factory();
  }
}(this, function () {
  'use strict';

  function create() {
    var lifecycle = 'idle';
    var stableLifecycle = 'idle';
    var switchPhase = 'starting';
    var streamSwitching = false;
    var buffering = false;
    var nativeSeekPending = false;
    var nativePlayPending = false;
    var nativeSourceReady = false;
    var nativeSourceAssigned = false;
    var reopenStartupGuard = false;
    var nativeSeekTarget = null;
    var nativeSeekAbsoluteTarget = null;
    var pendingTerminalPause = false;
    var terminalPlayback = false;
    var decoderReportPending = false;
    var bufferCheckpointState = null;
    var lastBufferRecovery = null;
    var clockDiscontinuityGeneration = 0;
    var clockRepairGeneration = -1;
    var destroyed = false;

    function refreshLifecycle() {
      if (destroyed) { lifecycle = 'closed'; }
      else if (nativeSeekPending) { lifecycle = 'repositioning'; }
      else if (streamSwitching) { lifecycle = switchPhase || 'starting'; }
      else if (terminalPlayback) { lifecycle = 'ending'; }
      else if (buffering) { lifecycle = 'buffering'; }
      else { lifecycle = stableLifecycle; }
      return lifecycle;
    }

    function copyRecord(source) {
      var result = {};
      var key;
      if (!source || typeof source !== 'object') { return null; }
      for (key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) { result[key] = source[key]; }
      }
      return result;
    }

    function beginClockDiscontinuity() {
      clockDiscontinuityGeneration += 1;
      return clockDiscontinuityGeneration;
    }

    function clockRepairAvailable() {
      return clockRepairGeneration !== clockDiscontinuityGeneration;
    }

    function consumeClockRepair() {
      if (!clockRepairAvailable()) { return false; }
      clockRepairGeneration = clockDiscontinuityGeneration;
      return true;
    }

    function clearRuntime(reopenGuard) {
      stableLifecycle = 'idle';
      switchPhase = 'starting';
      streamSwitching = false;
      buffering = false;
      nativeSeekPending = false;
      nativePlayPending = false;
      nativeSourceReady = false;
      nativeSourceAssigned = false;
      reopenStartupGuard = reopenGuard === true;
      nativeSeekTarget = null;
      nativeSeekAbsoluteTarget = null;
      pendingTerminalPause = false;
      terminalPlayback = false;
      decoderReportPending = false;
      bufferCheckpointState = null;
      lastBufferRecovery = null;
      clockDiscontinuityGeneration = 0;
      clockRepairGeneration = -1;
      refreshLifecycle();
    }

    function prepare() {
      if (destroyed) { return false; }
      stableLifecycle = 'preparing';
      nativeSourceReady = false;
      refreshLifecycle();
      return true;
    }

    function beginStreamSwitch(phase) {
      if (destroyed) { return false; }
      switchPhase = phase || 'starting';
      streamSwitching = true;
      // A new source cannot consume readiness/play events left by its predecessor.
      if (nativeSourceAssigned) { reopenStartupGuard = true; }
      nativeSourceAssigned = false;
      nativeSourceReady = false;
      refreshLifecycle();
      return true;
    }

    function finishStreamSwitch() {
      streamSwitching = false;
      refreshLifecycle();
    }

    function beginBuffering(checkpoint) {
      if (!buffering) {
        bufferCheckpointState = copyRecord(checkpoint);
        lastBufferRecovery = null;
        beginClockDiscontinuity();
      }
      buffering = true;
      refreshLifecycle();
    }

    function recordBufferRecovery(result) {
      if (result) { lastBufferRecovery = copyRecord(result); }
      return bufferRecovery();
    }

    function finishBuffering(result) {
      buffering = false;
      recordBufferRecovery(result);
      bufferCheckpointState = null;
      refreshLifecycle();
    }

    function bufferCheckpoint() { return copyRecord(bufferCheckpointState); }
    function bufferRecovery() { return copyRecord(lastBufferRecovery); }

    function beginNativeSeek(nativeTarget, absoluteTarget) {
      nativeSeekPending = true;
      nativeSeekTarget = nativeTarget;
      nativeSeekAbsoluteTarget = absoluteTarget;
      refreshLifecycle();
    }

    function finishNativeSeek() {
      nativeSeekPending = false;
      nativeSeekTarget = null;
      nativeSeekAbsoluteTarget = null;
      refreshLifecycle();
    }

    function beginNativePlay() { nativePlayPending = true; }
    function finishNativePlay() { nativePlayPending = false; }

    function markSourceAssigned() { nativeSourceAssigned = true; }

    function markSourceReady() {
      nativeSourceReady = true;
      reopenStartupGuard = false;
    }

    function markPlaying() {
      if (destroyed) { return false; }
      stableLifecycle = 'playing';
      streamSwitching = false;
      buffering = false;
      terminalPlayback = false;
      refreshLifecycle();
      return true;
    }

    function armReopenStartupGuard() {
      reopenStartupGuard = true;
      nativeSourceReady = false;
    }

    function shouldRejectPlaying() {
      return !!((reopenStartupGuard && streamSwitching && !nativeSourceReady) ||
        (nativeSeekPending && streamSwitching));
    }

    function setPendingTerminalPause(value) { pendingTerminalPause = value === true; }

    function markTerminalPlayback(value) {
      terminalPlayback = value === true;
      refreshLifecycle();
    }

    function setDecoderReportPending(value) { decoderReportPending = value === true; }

    function resetRuntime() { clearRuntime(false); }
    function resetForClose(hadPlayback) {
      var preserveReopenGuard = reopenStartupGuard || hadPlayback === true;
      clearRuntime(preserveReopenGuard);
    }

    function destroy() {
      clearRuntime(false);
      destroyed = true;
      refreshLifecycle();
    }

    function snapshot() {
      return {
        lifecycle: lifecycle,
        streamSwitching: streamSwitching,
        buffering: buffering,
        nativeSeekPending: nativeSeekPending,
        nativePlayPending: nativePlayPending,
        nativeSourceReady: nativeSourceReady,
        reopenStartupGuard: reopenStartupGuard,
        nativeSeekTarget: nativeSeekTarget,
        nativeSeekAbsoluteTarget: nativeSeekAbsoluteTarget,
        pendingTerminalPause: pendingTerminalPause,
        terminalPlayback: terminalPlayback,
        decoderReportPending: decoderReportPending,
        destroyed: destroyed
      };
    }

    return {
      lifecycle: function () { return lifecycle; },
      prepare: prepare,
      beginStreamSwitch: beginStreamSwitch,
      finishStreamSwitch: finishStreamSwitch,
      streamSwitching: function () { return streamSwitching; },
      beginBuffering: beginBuffering,
      finishBuffering: finishBuffering,
      buffering: function () { return buffering; },
      bufferCheckpoint: bufferCheckpoint,
      bufferRecovery: bufferRecovery,
      recordBufferRecovery: recordBufferRecovery,
      beginClockDiscontinuity: beginClockDiscontinuity,
      clockRepairAvailable: clockRepairAvailable,
      consumeClockRepair: consumeClockRepair,
      beginNativeSeek: beginNativeSeek,
      finishNativeSeek: finishNativeSeek,
      nativeSeekPending: function () { return nativeSeekPending; },
      nativeSeekTarget: function () { return nativeSeekTarget; },
      nativeSeekAbsoluteTarget: function () { return nativeSeekAbsoluteTarget; },
      beginNativePlay: beginNativePlay,
      finishNativePlay: finishNativePlay,
      nativePlayPending: function () { return nativePlayPending; },
      markSourceAssigned: markSourceAssigned,
      nativeSourceAssigned: function () { return nativeSourceAssigned; },
      markSourceReady: markSourceReady,
      nativeSourceReady: function () { return nativeSourceReady; },
      markPlaying: markPlaying,
      armReopenStartupGuard: armReopenStartupGuard,
      reopenStartupGuard: function () { return reopenStartupGuard; },
      shouldRejectPlaying: shouldRejectPlaying,
      setPendingTerminalPause: setPendingTerminalPause,
      pendingTerminalPause: function () { return pendingTerminalPause; },
      markTerminalPlayback: markTerminalPlayback,
      terminalPlayback: function () { return terminalPlayback; },
      setDecoderReportPending: setDecoderReportPending,
      decoderReportPending: function () { return decoderReportPending; },
      resetRuntime: resetRuntime,
      resetForClose: resetForClose,
      destroy: destroy,
      destroyed: function () { return destroyed; },
      snapshot: snapshot
    };
  }

  return { create: create };
}));
