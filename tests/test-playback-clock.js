'use strict';

var assert = require('assert');
var Clock = require('../shell/playback-clock');

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

console.log('Playback clock checks passed');
