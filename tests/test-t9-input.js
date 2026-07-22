'use strict';

var assert = require('assert');
var T9Input = require('../app/t9-input');

var timers = [];
var previews = [];
var commits = [];
var root = {
  clearTimeout: function (timer) { if (timer) { timer.cleared = true; } },
  setTimeout: function (callback, delay) {
    var timer = { callback: callback, delay: delay, cleared: false };
    timers.push(timer);
    return timer;
  }
};
var input = T9Input.create({
  root: root,
  onPreview: function (character) { previews.push(character); },
  onCommit: function (character) { commits.push(character); }
});

assert.strictEqual(input.inputKeyCode(50), true, 'top-row 2 must start T9 composition');
assert.strictEqual(previews[previews.length - 1], 'a', 'the first press on 2 must preview a');
assert.strictEqual(timers[0].delay, 700, 'T9 composition must use a readable seven hundred millisecond window');
input.inputKeyCode(50);
assert.strictEqual(previews[previews.length - 1], 'b', 'a repeated press must cycle within the active key');
input.inputKeyCode(50);
assert.strictEqual(previews[previews.length - 1], 'c', 'the third press must reach the final letter on key 2');
timers[timers.length - 1].callback();
assert.deepStrictEqual(commits, ['c'], 'composition timeout must commit only the selected letter');

input.inputKeyCode(49);
input.inputKeyCode(49);
input.inputKeyCode(49);
input.inputKeyCode(49);
input.inputKeyCode(49);
assert.strictEqual(previews[previews.length - 1], "'", 'key 1 must include apostrophe after punctuation');
input.inputKeyCode(49);
assert.strictEqual(previews[previews.length - 1], '-', 'key 1 must include a trailing hyphen');

input.inputKeyCode(53);
assert.strictEqual(commits[commits.length - 1], '-', 'pressing another digit must commit the previous composition');
assert.strictEqual(previews[previews.length - 1], 'j', 'the new digit must immediately start its own composition');
assert.strictEqual(input.backspace(), true, 'backspace must cancel an active composition first');
assert.strictEqual(previews[previews.length - 1], '', 'cancelling composition must clear its preview');

assert.strictEqual(input.inputKeyCode(48), true, 'zero must be accepted as space');
assert.strictEqual(commits[commits.length - 1], ' ', 'zero must commit a space immediately');
assert.strictEqual(input.inputKeyCode(57), true, 'nine must be accepted');
input.flush();
assert.strictEqual(commits[commits.length - 1], 'w', 'flush must commit the current letter without waiting');
input.cancel();
assert.strictEqual(input.snapshot().pending, '', 'cancel must leave no pending T9 state');

console.log('T9 input checks passed');
