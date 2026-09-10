'use strict';

var assert = require('assert');
var PlaybackSession = require('../app/playback-session');

(function lifecycleAndTransientStateStayCoherent() {
  var session = PlaybackSession.create();
  assert.strictEqual(session.lifecycle(), 'idle');
  session.prepare();
  assert.strictEqual(session.lifecycle(), 'preparing');
  session.beginStreamSwitch('starting');
  assert.strictEqual(session.lifecycle(), 'starting');
  assert.strictEqual(session.streamSwitching(), true);
  session.markSourceReady();
  assert.strictEqual(session.nativeSourceReady(), true);
  session.beginNativeSeek(12, 42);
  assert.strictEqual(session.lifecycle(), 'repositioning');
  assert.strictEqual(session.nativeSeekPending(), true);
  assert.strictEqual(session.nativeSeekTarget(), 12);
  assert.strictEqual(session.nativeSeekAbsoluteTarget(), 42);
  session.finishNativeSeek();
  assert.strictEqual(session.lifecycle(), 'starting');
  session.finishStreamSwitch();
  session.markPlaying();
  assert.strictEqual(session.lifecycle(), 'playing');
  session.beginBuffering();
  assert.strictEqual(session.lifecycle(), 'buffering');
  session.finishBuffering();
  assert.strictEqual(session.lifecycle(), 'playing');
  session.markTerminalPlayback(true);
  assert.strictEqual(session.lifecycle(), 'ending');
  session.markTerminalPlayback(false);
  assert.strictEqual(session.lifecycle(), 'playing');
}());

(function closingMediaPreservesTheReopenStartupGuardUntilNewSourceIsReady() {
  var session = PlaybackSession.create();
  session.prepare();
  session.beginStreamSwitch('starting');
  session.markSourceReady();
  session.markPlaying();
  session.resetForClose(true);
  assert.strictEqual(session.reopenStartupGuard(), true);
  assert.strictEqual(session.nativeSourceReady(), false);
  session.prepare();
  session.beginStreamSwitch('starting');
  assert.strictEqual(session.shouldRejectPlaying(), true, 'late playing must stay blocked before the reopened source can play');
  session.markSourceReady();
  assert.strictEqual(session.reopenStartupGuard(), false);
  assert.strictEqual(session.shouldRejectPlaying(), false, 'current source may play after its own canplay');
}());

(function aNewStreamSwitchInvalidatesNativeReadiness() {
  var session = PlaybackSession.create();
  session.prepare();
  session.beginStreamSwitch('starting');
  session.markSourceReady();
  assert.strictEqual(session.nativeSourceReady(), true);
  session.beginStreamSwitch('recovering');
  assert.strictEqual(session.nativeSourceReady(), false);
}());

(function aSecondEmptyCloseMustNotEraseAnArmedReopenGuard() {
  var session = PlaybackSession.create();
  session.prepare();
  session.beginStreamSwitch('starting');
  session.markSourceReady();
  session.markPlaying();
  session.resetForClose(true);
  session.resetForClose(false);
  session.prepare();
  session.beginStreamSwitch('starting');
  assert.strictEqual(session.shouldRejectPlaying(), true,
    'the defensive empty close at the start of open must preserve the previous-session guard');
}());

(function pendingStartupSeekAlsoRejectsPrematurePlaying() {
  var session = PlaybackSession.create();
  session.prepare();
  session.beginStreamSwitch('starting');
  session.markSourceReady();
  session.beginNativeSeek(40, 40);
  assert.strictEqual(session.shouldRejectPlaying(), true);
  session.finishNativeSeek();
  assert.strictEqual(session.shouldRejectPlaying(), false);
}());

(function bufferingNeverHidesAnActiveStreamSwitchPhase() {
  var session = PlaybackSession.create();
  session.prepare();
  session.beginStreamSwitch('recovering');
  session.beginBuffering();
  assert.strictEqual(session.lifecycle(), 'recovering');
  session.beginNativeSeek(5, 5);
  assert.strictEqual(session.lifecycle(), 'repositioning');
  session.finishNativeSeek();
  assert.strictEqual(session.lifecycle(), 'recovering');
  session.finishStreamSwitch();
  assert.strictEqual(session.lifecycle(), 'buffering');
  session.finishBuffering();
  session.markPlaying();
  assert.strictEqual(session.lifecycle(), 'playing');
}());

(function runtimeResetClearsTransientFlagsWithoutDestroyingTheOwner() {
  var session = PlaybackSession.create();
  session.prepare();
  session.beginStreamSwitch('recovering');
  session.beginNativeSeek(4, 9);
  session.beginNativePlay();
  session.setPendingTerminalPause(true);
  session.setDecoderReportPending(true);
  session.markTerminalPlayback(true);
  session.resetRuntime();
  assert.deepStrictEqual(session.snapshot(), {
    lifecycle: 'idle',
    streamSwitching: false,
    buffering: false,
    nativeSeekPending: false,
    nativePlayPending: false,
    nativeSourceReady: false,
    reopenStartupGuard: false,
    nativeSeekTarget: null,
    nativeSeekAbsoluteTarget: null,
    pendingTerminalPause: false,
    terminalPlayback: false,
    decoderReportPending: false,
    destroyed: false
  });
  session.destroy();
  assert.strictEqual(session.lifecycle(), 'closed');
  assert.strictEqual(session.destroyed(), true);
}());


(function bufferingCheckpointAndRepairBudgetAreScopedToOneDiscontinuity() {
  var session = PlaybackSession.create();
  var first = { absoluteTime: 120, nativeTime: 20, offsetBase: 100 };
  var second = { absoluteTime: 240, nativeTime: 40, offsetBase: 200 };
  session.prepare();
  session.markPlaying();
  assert.strictEqual(session.clockRepairAvailable(), true, 'a fresh playback session must allow one bounded clock repair');
  session.beginBuffering(first);
  first.absoluteTime = 999;
  assert.deepStrictEqual(session.bufferCheckpoint(), { absoluteTime: 120, nativeTime: 20, offsetBase: 100 },
    'buffering must retain a defensive copy of the first confirmed clock checkpoint');
  session.beginBuffering(second);
  assert.deepStrictEqual(session.bufferCheckpoint(), { absoluteTime: 120, nativeTime: 20, offsetBase: 100 },
    'repeated waiting/stalled events in one incident must not replace the original checkpoint');
  assert.strictEqual(session.consumeClockRepair(), true, 'the current buffering incident may consume one repair');
  assert.strictEqual(session.consumeClockRepair(), false, 'the same incident must not trigger an unbounded rebuild loop');
  session.recordBufferRecovery({ accepted: false, reason: 'forward-jump', delta: 8 });
  assert.deepStrictEqual(session.bufferCheckpoint(), { absoluteTime: 120, nativeTime: 20, offsetBase: 100 },
    'recording the recovery reason must not release the checkpoint before the rebuild reports its frozen position');
  session.finishBuffering();
  assert.deepStrictEqual(session.bufferRecovery(), { accepted: false, reason: 'forward-jump', delta: 8 },
    'the last bounded recovery result must remain available for diagnostics');
  assert.strictEqual(session.bufferCheckpoint(), null, 'finishing an incident must clear the active checkpoint');

  session.beginBuffering(second);
  assert.strictEqual(session.clockRepairAvailable(), true, 'a later independent buffering incident must re-arm one repair');
  assert.strictEqual(session.bufferRecovery(), null, 'a new buffering incident must not inherit the previous incident recovery reason');
  session.finishBuffering({ accepted: true, reason: 'accepted', delta: 0.2 });
  session.consumeClockRepair();
  assert.strictEqual(session.clockRepairAvailable(), false);
  session.beginClockDiscontinuity();
  assert.strictEqual(session.clockRepairAvailable(), true, 'an explicit seek/discontinuity must re-arm one clock repair');

  session.resetRuntime();
  assert.strictEqual(session.bufferCheckpoint(), null, 'runtime reset must clear active buffering diagnostics');
  assert.strictEqual(session.bufferRecovery(), null, 'runtime reset must clear previous buffering diagnostics');
  assert.strictEqual(session.clockRepairAvailable(), true, 'runtime reset must restore the initial bounded repair allowance');
}());

console.log('Playback session checks passed');
