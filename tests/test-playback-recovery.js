'use strict';

var assert = require('assert');
var Recovery = require('../app/playback-recovery');

var state = Recovery.create([{ kind: 'direct-play' }, { kind: 'direct-stream' }, { kind: 'transcode' }]);
state = Recovery.start(state, 125);
assert.strictEqual(state.status, 'loading', 'starting playback must enter loading state');
assert.strictEqual(state.position, 125, 'recovery must retain the absolute playback position');

state = Recovery.fail(state, false, 126);
assert.strictEqual(state.status, 'retrying', 'an online failure must advance to the next bounded strategy');
assert.strictEqual(state.index, 1, 'recovery must advance exactly one strategy');
assert.strictEqual(Recovery.current(state).kind, 'direct-stream', 'the active fallback must be observable');

state = Recovery.fail(state, true, 130);
assert.strictEqual(state.status, 'waiting-network', 'offline failures must wait without consuming another strategy');
assert.strictEqual(state.index, 1, 'network loss must not consume a fallback');
state = Recovery.online(state);
assert.strictEqual(state.status, 'retrying', 'network restoration must retry the same strategy');
assert.strictEqual(state.index, 1, 'network restoration must preserve the strategy index');

state = Recovery.fail(state, false, 131);
state = Recovery.fail(state, false, 132);
assert.strictEqual(state.status, 'failed', 'recovery must stop after the final strategy');
assert.strictEqual(Recovery.canRetry(state), true, 'a final failure must remain manually retryable');
state = Recovery.retry(state);
assert.strictEqual(state.status, 'retrying', 'manual retry must restart the strategy ladder');
assert.strictEqual(state.index, 0, 'manual retry must restart from the preferred strategy');

state = Recovery.create([{ kind: 'direct-play' }, { kind: 'direct-stream' }, { kind: 'transcode' }]);
state = Recovery.start(state, 37);
state = Recovery.rebuild(state, 12);
assert.strictEqual(state.position, 12, 'a reconstructed seek must preserve the requested absolute position');
assert.strictEqual(state.index, 1, 'a reconstructed seek must leave full-file Direct Play before applying an offset');
assert.strictEqual(Recovery.current(state).kind, 'direct-stream', 'a reconstructed Direct Play seek must use an offset-capable stream');
assert.strictEqual(state.status, 'retrying', 'an offset-capable reconstruction must be ready to start immediately');

state = Recovery.rebuild(state, 24);
assert.strictEqual(state.index, 1, 'an already offset-capable stream must retain its current strategy');
assert.strictEqual(state.position, 24, 'an HLS reconstruction must update its absolute position');

console.log('Playback recovery checks passed');
