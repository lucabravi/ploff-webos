'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var modulePath = path.join(__dirname, '..', 'app', 'player-controls-state.js');

assert.ok(fs.existsSync(modulePath), 'the player control state module must exist');

var PlayerControlsState = require(modulePath);

assert.strictEqual(PlayerControlsState.next('hidden', 'ok'), 'full', 'OK must reveal full controls from hidden playback');
assert.strictEqual(PlayerControlsState.next('hidden', 'seek'), 'timeline', 'hidden seeking must reveal only the timeline');
assert.strictEqual(PlayerControlsState.next('timeline', 'seek'), 'timeline', 'repeated seeking must keep compact controls visible');
assert.strictEqual(PlayerControlsState.next('timeline', 'navigate'), 'full', 'vertical navigation must expand compact controls');
assert.strictEqual(PlayerControlsState.next('timeline', 'pointer'), 'full', 'pointer movement must expand compact controls');
assert.strictEqual(PlayerControlsState.next('full', 'timeout'), 'hidden', 'full controls must hide after inactivity');
assert.strictEqual(PlayerControlsState.timeout('timeline'), 3000, 'compact timeline inactivity must last three seconds');
assert.strictEqual(PlayerControlsState.timeout('full'), 5000, 'full controls must retain the existing five-second timeout');
assert.strictEqual(PlayerControlsState.visible('hidden'), false, 'hidden controls must not be considered visible');
assert.strictEqual(PlayerControlsState.visible('timeline'), true, 'compact timeline controls must remain visible');

console.log('Player controls state checks passed');
