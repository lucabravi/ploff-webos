'use strict';

var assert = require('assert');
var ResumeChoice = require('../app/resume-choice');

var state = ResumeChoice.create(793499);
assert.strictEqual(state.visible, true, 'a positive Plex view offset must open the prompt');
assert.strictEqual(state.index, 0, 'Resume must receive initial focus');
assert.strictEqual(state.offset, 793, 'the Plex millisecond offset must become whole playback seconds');
assert.deepStrictEqual(ResumeChoice.select(state), { action: 'resume', offset: 793 }, 'the default action must resume from Plex time');

state = ResumeChoice.move(state, 1);
assert.strictEqual(state.index, 1, 'Right must focus Play from beginning');
assert.deepStrictEqual(ResumeChoice.select(state), { action: 'restart', offset: 0 }, 'Restart must explicitly request zero');

state = ResumeChoice.move(state, 1);
assert.strictEqual(state.index, 2, 'Right must focus Cancel after Restart');
assert.deepStrictEqual(ResumeChoice.select(state), { action: 'cancel', offset: null }, 'the third action must cancel playback');
assert.deepStrictEqual(ResumeChoice.cancel(), { action: 'cancel', offset: null }, 'Back must be identical to Cancel');

state = ResumeChoice.move(state, 1);
assert.strictEqual(state.index, 0, 'focus movement must wrap after Cancel');
state = ResumeChoice.move(state, -1);
assert.strictEqual(state.index, 2, 'focus movement must wrap before Resume');

assert.deepStrictEqual(ResumeChoice.create(0), { visible: false, index: 0, offset: 0 }, 'zero progress must not show the prompt');
assert.deepStrictEqual(ResumeChoice.create(-100), { visible: false, index: 0, offset: 0 }, 'negative progress must be treated as zero');
assert.deepStrictEqual(ResumeChoice.create('invalid'), { visible: false, index: 0, offset: 0 }, 'invalid progress must be treated as zero');

console.log('Resume choice checks passed');
