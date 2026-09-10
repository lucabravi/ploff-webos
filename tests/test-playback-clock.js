'use strict';

var assert = require('assert');
var Clock = require('../app/playback-clock');

var state = Clock.create(2);
state = Clock.anchor(state, 30);

var observation = Clock.observe(state, 0, 31, false);
state = observation.state;
assert.strictEqual(observation.time, 31, 'normal playback must follow the native media clock');
assert.strictEqual(observation.desynced, false, 'normal forward playback must remain synchronized');

state = Clock.freeze(state, true);
observation = Clock.observe(state, 0, 5, false);
state = observation.state;
assert.strictEqual(observation.time, 31, 'buffering must freeze the last confirmed absolute position');
assert.strictEqual(observation.desynced, false, 'a transient buffering sample must not immediately trigger recovery');

state = Clock.freeze(state, false);
observation = Clock.observe(state, 0, 5, false);
assert.strictEqual(observation.time, 31, 'an unsolicited backward jump must not move the public timeline');
assert.strictEqual(observation.desynced, true, 'a persistent backward jump after buffering must be detected');
assert.strictEqual(observation.correctionNativeTime, 31, 'recovery must identify the native time matching the last confirmed position');

state = Clock.anchor(observation.state, 10);
observation = Clock.observe(state, 0, 10, true);
state = observation.state;
assert.strictEqual(observation.time, 10, 'an explicit backward seek must replace the previous monotonic position');
assert.strictEqual(observation.desynced, false, 'an explicit backward seek must never be treated as clock drift');

state = Clock.anchor(state, 45);
state = Clock.freeze(state, true);
observation = Clock.observe(state, 45, 28, false);
assert.strictEqual(observation.time, 45, 'a new stream offset must not be combined with the old media currentTime while loading');
state = Clock.freeze(observation.state, false);
observation = Clock.observe(state, 45, 0, false);
assert.strictEqual(observation.time, 45, 'a rebuilt relative stream must resume exactly at its absolute offset');


(function bufferingResumeAssessmentRejectsClockPoisoningWithoutChangingNormalClockRules() {
  var assess = Clock.assessBufferResume;
  var checkpoint = { absoluteTime: 120, nativeTime: 20, offsetBase: 100 };
  var result;
  assert.strictEqual(typeof assess, 'function', 'PlaybackClock must expose pure buffering-resume assessment');

  result = assess(checkpoint, 100, 20.4, { backwardTolerance: 2, forwardLimit: 5 });
  assert.strictEqual(result.accepted, true, 'a normal post-buffer sample near the frozen position must be accepted');
  assert.strictEqual(result.candidate, 120.4);
  assert.strictEqual(result.reason, 'accepted');

  result = assess(checkpoint, 100, 18.5, { backwardTolerance: 2, forwardLimit: 5 });
  assert.strictEqual(result.accepted, true, 'a small decoder rollback inside the existing tolerance must remain recoverable without a rebuild');
  assert.strictEqual(result.delta, -1.5);

  result = assess(checkpoint, 100, 17.5, { backwardTolerance: 2, forwardLimit: 5 });
  assert.strictEqual(result.accepted, false, 'a post-buffer rollback beyond the public clock tolerance must be rejected');
  assert.strictEqual(result.reason, 'backward-jump');
  assert.strictEqual(result.target, 120, 'recovery target must remain the last confirmed absolute position');

  result = assess(checkpoint, 100, 26, { backwardTolerance: 2, forwardLimit: 5 });
  assert.strictEqual(result.accepted, false, 'a large post-buffer forward jump must not poison the monotonic public clock');
  assert.strictEqual(result.reason, 'forward-jump');
  assert.strictEqual(result.delta, 6);

  result = assess({ absoluteTime: 1920, nativeTime: 120, offsetBase: 1800 }, 1800, 1921,
    { backwardTolerance: 2, forwardLimit: 5 });
  assert.strictEqual(result.accepted, false, 'offset HLS must reject a native sample that suddenly switches to the absolute Plex domain');
  assert.strictEqual(result.reason, 'native-domain-flip');
  assert.strictEqual(result.candidate, 3721);

  result = assess(checkpoint, 101, 20, { backwardTolerance: 2, forwardLimit: 5 });
  assert.strictEqual(result.accepted, false, 'a changed stream offset cannot be validated against the previous buffering checkpoint');
  assert.strictEqual(result.reason, 'offset-changed');

  result = assess(checkpoint, 100, null, { backwardTolerance: 2, forwardLimit: 5 });
  assert.strictEqual(result.accepted, false, 'nullable native time must never be coerced to a valid zero sample');
  assert.strictEqual(result.reason, 'invalid-sample');
}());

console.log('Playback clock checks passed');
