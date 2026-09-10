'use strict';

var assert = require('assert');
var Clock = require('../app/playback-clock');
var Seek = require('../app/player-seek-controller');
var Reposition = require('../app/playback-reposition');
var failures = 0;
var cases = 0;
function test(name, callback) {
  cases += 1;
  try { callback(); console.log('PASS ' + name); }
  catch (error) { failures += 1; console.error('FAIL ' + name + '\n' + error.stack); }
}
function owner() { return Reposition.create({ PlaybackClock: Clock, PlayerSeekController: Seek }); }
function sample(nativeTime, changes) {
  return Object.assign({ directPlay: false, nativeTime: nativeTime, offset: 100, buffered: [{ start: 0, end: 100 }] }, changes || {});
}

test('explicit HLS seek adopts one buffered decoded rollback in absolute seconds', function () {
  var reposition = owner();
  var clock = Clock.anchor(Clock.create(2), 130);
  assert.strictEqual(reposition.arm(130, 'seek', false, 100), true);
  var result = reposition.settle(clock, sample(24));
  assert.strictEqual(result.settled, true);
  assert.strictEqual(Clock.position(result.clock), 124, 'offset is added exactly once');
  assert.strictEqual(reposition.pending(), false);
  result = reposition.settle(result.clock, sample(23));
  assert.strictEqual(result.settled, false, 'the same seek cannot repeatedly lower the clock');
  assert.strictEqual(Clock.position(result.clock), 124);
});

test('HLS cannot borrow DP seekable evidence when decoded time is not buffered', function () {
  var reposition = owner();
  var clock = Clock.anchor(Clock.create(2), 130);
  reposition.arm(130, 'seek', false, 100);
  var result = reposition.settle(clock, sample(24, { buffered: [], seekable: [{ start: 0, end: 500 }] }));
  assert.strictEqual(result.settled, false);
  assert.strictEqual(Clock.position(result.clock), 130);
  assert.strictEqual(reposition.pending(), true);
});

test('a different HLS source offset retires old settlement without rebasing content', function () {
  var reposition = owner();
  var clock = Clock.anchor(Clock.create(2), 130);
  reposition.arm(130, 'seek', false, 100);
  var result = reposition.settle(clock, sample(24, { offset: 95 }));
  assert.strictEqual(result.settled, false);
  assert.strictEqual(Clock.position(result.clock), 130);
  assert.strictEqual(reposition.pending(), false);
});

test('HLS startup is never a native-seek settlement opportunity', function () {
  var reposition = owner();
  assert.strictEqual(reposition.arm(130, 'startup', false, 100), false);
  assert.strictEqual(reposition.pending(), false);
  reposition.arm(130, 'seek', false); // default remains the existing DP contract
  assert.strictEqual(reposition.settle(Clock.anchor(Clock.create(2), 130), sample(24)).settled, false);
});

test('HLS settlement requires finite nonnegative native samples and a valid source origin', function () {
  [null, undefined, '', NaN, Infinity, -0.1].forEach(function (value) {
    var reposition = owner();
    reposition.arm(110, 'seek', false, 100);
    var result = reposition.settle(Clock.anchor(Clock.create(2), 110), sample(value));
    assert.strictEqual(result.settled, false, String(value) + ' must not become decoded content');
    assert.strictEqual(Clock.position(result.clock), 110);
  });
  [-1, NaN, Infinity, null, ''].forEach(function (offset) {
    var reposition = owner();
    assert.strictEqual(reposition.arm(130, 'seek', false, offset), false);
  });
  assert.strictEqual(owner().arm(90, 'seek', false, 100), false, 'a target before this source belongs to a rebuild');
});

test('HLS settlement expires after established progress or an implausible rollback', function () {
  var reposition = owner();
  var clock = Clock.anchor(Clock.create(2), 130);
  reposition.arm(130, 'seek', false, 100);
  assert.strictEqual(reposition.settle(clock, sample(34.9)).settled, false);
  assert.strictEqual(reposition.pending(), true);
  assert.strictEqual(reposition.settle(clock, sample(35)).settled, false);
  assert.strictEqual(reposition.pending(), false);
  reposition.arm(130, 'seek', false, 100);
  assert.strictEqual(reposition.settle(clock, sample(14)).settled, false);
  assert.strictEqual(reposition.pending(), false);
});

test('switching delivery cannot interpret HLS settlement as DP evidence', function () {
  var reposition = owner();
  var clock = Clock.anchor(Clock.create(2), 130);
  reposition.arm(130, 'seek', false, 100);
  var result = reposition.settle(clock, sample(124, { directPlay: true, offset: 0, seekable: [{ start: 0, end: 600 }] }));
  assert.strictEqual(result.settled, false);
  assert.strictEqual(Clock.position(result.clock), 130);
  assert.strictEqual(reposition.pending(), false);
});

console.log('HLS reposition cases: ' + cases + ', failures: ' + failures);
if (failures) { process.exitCode = 1; }
