'use strict';

var assert = require('assert');
var UpNextState = require('../app/up-next-state');
var state = UpNextState.create();

assert.strictEqual(state.snapshot().visible, false, 'Up Next starts hidden');
state.show({ title: 'Episode 2' }, 10, 'bottom-panel');
assert.strictEqual(state.snapshot().layout, 'bottom-panel', 'accepts the bottom panel layout');
assert.strictEqual(state.snapshot().progress, 1, 'starts with a full countdown bar');
assert.strictEqual(state.snapshot().focus, 1, 'Play now receives initial focus on the right');
assert.strictEqual(state.select(), 'play', 'initial OK activates Play now');
state.move(-1);
assert.strictEqual(state.snapshot().focus, 0, 'Left moves focus to Cancel');
assert.strictEqual(state.select(), 'cancel', 'OK activates the focused Cancel action');
state.move(1);
assert.strictEqual(state.snapshot().focus, 1, 'Right returns focus to Play now');
state.tick(4);
assert.strictEqual(state.snapshot().seconds, 4, 'updates remaining seconds');
assert.strictEqual(state.snapshot().progress, 0.4, 'derives progress from remaining seconds');
state.hide();
assert.strictEqual(state.snapshot().visible, false, 'hides without discarding current item');

console.log('Up Next state checks passed');
