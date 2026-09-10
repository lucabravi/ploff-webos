'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var PlaybackClock = require('../app/playback-clock');
var PlayerSeekController = require('../app/player-seek-controller');
var PlaybackReposition = require('../app/playback-reposition');

(function delegatesAbsoluteNativeDecisionWithoutOwningRecovery() {
  var reposition = PlaybackReposition.create({
    PlaybackClock: PlaybackClock,
    PlayerSeekController: PlayerSeekController
  });
  var nativeDecision = reposition.decide({
    target: 50,
    duration: 100,
    nativeDuration: 100,
    offset: 0,
    buffered: [{ start: 0, end: 100 }],
    seekable: [{ start: 0, end: 100 }],
    directPlay: true
  });
  var unavailableDecision = reposition.decide({
    target: 50,
    duration: 100,
    nativeDuration: 100,
    offset: 0,
    buffered: [],
    seekable: [],
    directPlay: true
  });

  assert.deepStrictEqual(nativeDecision, { operation: 'native', target: 50, nativeTime: 50 });
  assert.deepStrictEqual(unavailableDecision, { operation: 'rebuild', target: 50, nativeTime: null },
    'Reposition may request source reconstruction but must not decide or advance fallback itself');
}());

(function boundedDecoderSettlementAdoptsTheDecodedKeyframeOnce() {
  var reposition = PlaybackReposition.create({ PlaybackClock: PlaybackClock, PlayerSeekController: PlayerSeekController });
  var clock = PlaybackClock.anchor(PlaybackClock.create(2), 500);
  var result;

  reposition.arm(500, 'seek', true);
  assert.strictEqual(reposition.pending(), true);
  assert.strictEqual(reposition.holdReport(), true);
  result = reposition.settle(clock, {
    directPlay: true,
    offset: 0,
    nativeTime: 494,
    seekable: [{ start: 0, end: 600 }]
  });

  assert.strictEqual(result.settled, true, 'a bounded preceding keyframe must become authoritative');
  assert.strictEqual(PlaybackClock.position(result.clock), 494);
  assert.strictEqual(reposition.pending(), false, 'settlement is one-shot');
  assert.strictEqual(reposition.holdReport(), false);
}());

(function settlementWaitsForEvidenceThenExpiresWithoutEffects() {
  var reposition = PlaybackReposition.create({ PlaybackClock: PlaybackClock, PlayerSeekController: PlayerSeekController });
  var clock = PlaybackClock.anchor(PlaybackClock.create(2), 500);
  var result;

  reposition.arm(500, 'seek', false);
  result = reposition.settle(clock, {
    directPlay: true,
    offset: 0,
    nativeTime: 501,
    seekable: [{ start: 0, end: 600 }]
  });
  assert.strictEqual(result.settled, false);
  assert.strictEqual(reposition.pending(), true, 'seek settlement must remain armed inside its established five-second advance window');
  assert.strictEqual(PlaybackClock.position(result.clock), 500, 'non-settling observations must not move the authoritative clock');

  result = reposition.settle(result.clock, {
    directPlay: true,
    offset: 0,
    nativeTime: 505,
    seekable: [{ start: 0, end: 600 }]
  });
  assert.strictEqual(result.settled, false);
  assert.strictEqual(reposition.pending(), false, 'the seek settlement window must expire after five seconds of forward progress');
  assert.strictEqual(PlaybackClock.position(result.clock), 500);
}());

(function settlementRejectsRollbackOutsideTheEstablishedBound() {
  var reposition = PlaybackReposition.create({ PlaybackClock: PlaybackClock, PlayerSeekController: PlayerSeekController });
  var clock = PlaybackClock.anchor(PlaybackClock.create(2), 500);
  var result;

  reposition.arm(500, 'startup', true);
  result = reposition.settle(clock, {
    directPlay: true,
    offset: 0,
    nativeTime: 480,
    seekable: [{ start: 0, end: 600 }]
  });
  assert.strictEqual(result.settled, false);
  assert.strictEqual(reposition.pending(), false, 'a rollback larger than fifteen seconds must disarm settlement');
  assert.strictEqual(PlaybackClock.position(result.clock), 500);
}());

(function seekVerificationAndRepairStayBehindTheBoundary() {
  var calls = [];
  var fakeSeek = {
    decide: function (options) { calls.push(['decide', options.target]); return { operation: 'native', target: options.target, nativeTime: 1 }; },
    reached: function (target, actual) { calls.push(['reached', target, actual]); return true; },
    repair: function (options) { calls.push(['repair', options.nativeTime]); return 'rebuild'; },
    buffered: function () { return true; }
  };
  var reposition = PlaybackReposition.create({ PlaybackClock: PlaybackClock, PlayerSeekController: fakeSeek });

  reposition.decide({ target: 9 });
  assert.strictEqual(reposition.reached(9, 8.9), true);
  assert.strictEqual(reposition.repair({ nativeTime: 8.9 }), 'rebuild');
  assert.deepStrictEqual(calls, [['decide', 9], ['reached', 9, 8.9], ['repair', 8.9]]);
}());

(function sourceCannotAdvanceRecoveryFallback() {
  var source = fs.readFileSync(path.join(__dirname, '../app/playback-reposition.js'), 'utf8');
  assert.ok(!/PlaybackRecovery/.test(source), 'PlaybackReposition must not depend on PlaybackRecovery');
  assert.ok(!/\.fail\s*\(|\.rebuild\s*\(/.test(source), 'PlaybackReposition must not advance recovery fallback by hidden calls');
}());

console.log('Playback reposition checks passed');
