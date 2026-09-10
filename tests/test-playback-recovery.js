'use strict';

var assert = require('assert');
var Recovery = require('../app/playback-recovery');

(function genericOperationsCannotChangeDelivery() {
  ['direct-play', 'direct-stream', 'transcode'].forEach(function (kind, index) {
    var initial = Recovery.start(Recovery.create([{ kind: 'direct-play' }, { kind: 'direct-stream' }, { kind: 'transcode' }]), 120);
    initial.index = index;
    assert.strictEqual(Recovery.fail(initial, false, 0).index, index, 'generic failure must retain ' + kind);
    assert.strictEqual(Recovery.fail(initial, false, 0).position, 0, 'failure must retain position zero');
    assert.strictEqual(Recovery.retry(initial).index, index, 'manual retry must retain ' + kind);
    assert.strictEqual(Recovery.rebuild(initial, 5).index, index, 'rebuild must retain ' + kind);
  });
}());

(function onlyClassifiedEvidenceAuthorizesFallback() {
  var plan = [{ kind: 'direct-play' }, { kind: 'direct-stream' }, { kind: 'transcode' }];
  ['direct-play', 'direct-stream'].forEach(function (kind, index) {
    var initial = Recovery.start(Recovery.create(plan), 120);
    initial.index = index;
    [null, {}, { code: 1 }, { code: 2 }, { message: 'decoder timeout' }, { message: 'unsupported operation' }].forEach(function (error) {
      assert.strictEqual(Recovery.fallback(initial, false, 0, error, 'native').index, index, 'unknown/network/aborted errors cannot demote ' + kind);
    });
    ['seek', 'clock', 'prepare', 'rebuild'].forEach(function (source) {
      assert.strictEqual(Recovery.fallback(initial, false, 0, { code: 3 }, source).index, index, 'non-MediaError codes must not authorize fallback from ' + source);
    });
    [3, 4].forEach(function (code) {
      var next = Recovery.fallback(initial, false, 0, { code: code }, 'native');
      assert.strictEqual(next.index, index + 1, 'native decode/unsupported-source evidence advances exactly one tier');
      assert.strictEqual(next.position, 0);
      assert.strictEqual(initial.index, index, 'fallback cannot mutate a retained previous attempt');
      assert.strictEqual(Recovery.fallback(initial, true, 0, { code: code }, 'native').index, index, 'offline never consumes fallback');
    });
    assert.strictEqual(Recovery.fallback(initial, false, 20, { message: 'unsupported codec' }, 'rebuild').index, index + 1);
  });
}());

var state = Recovery.create([{ kind: 'direct-play' }, { kind: 'direct-stream' }, { kind: 'transcode' }]);
state = Recovery.start(state, 125);
assert.strictEqual(state.status, 'loading', 'starting playback must enter loading state');
assert.strictEqual(state.position, 125, 'recovery must retain the absolute playback position');

state = Recovery.fallback(state, false, 126, { code: 3 }, 'native');
assert.strictEqual(state.status, 'retrying', 'an online failure must advance to the next bounded strategy');
assert.strictEqual(state.index, 1, 'recovery must advance exactly one strategy');
assert.strictEqual(Recovery.current(state).kind, 'direct-stream', 'the active fallback must be observable');

state = Recovery.fail(state, true, 130);
assert.strictEqual(state.status, 'waiting-network', 'offline failures must wait without consuming another strategy');
assert.strictEqual(state.index, 1, 'network loss must not consume a fallback');
state = Recovery.online(state);
assert.strictEqual(state.status, 'retrying', 'network restoration must retry the same strategy');
assert.strictEqual(state.index, 1, 'network restoration must preserve the strategy index');

state = Recovery.fallback(state, false, 131, { code: 3 }, 'native');
state = Recovery.fallback(state, false, 132, { code: 3 }, 'native');
assert.strictEqual(state.status, 'failed', 'recovery must stop after the final strategy');
assert.strictEqual(Recovery.canRetry(state), true, 'a final failure must remain manually retryable');
state = Recovery.retry(state);
assert.strictEqual(state.status, 'retrying', 'manual retry must restart the current strategy');
assert.strictEqual(state.index, 2, 'manual retry must retain the selected strategy');

state = Recovery.create([{ kind: 'direct-play' }, { kind: 'direct-stream' }, { kind: 'transcode' }]);
state = Recovery.start(state, 125);
state = Recovery.failCurrent(state, false, 126);
assert.strictEqual(state.status, 'failed', 'a sticky delivery failure must stop bounded automatic recovery');
assert.strictEqual(state.index, 0, 'a sticky delivery failure must preserve the current strategy index');
assert.strictEqual(Recovery.current(state).kind, 'direct-play', 'a sticky Direct Play failure must not silently consume Direct Stream');
state = Recovery.failCurrent(state, true, 127);
assert.strictEqual(state.status, 'waiting-network', 'an offline sticky failure must remain retryable after connectivity returns');
assert.strictEqual(state.index, 0, 'network loss must not consume the sticky Direct Play strategy');

state = Recovery.create([{ kind: 'direct-play' }, { kind: 'direct-stream' }]);
state = Recovery.start(state, 125);
state = Recovery.failCurrent(state, false, 0);
assert.strictEqual(state.position, 0, 'a sticky Direct Play failure at the beginning must preserve absolute position zero');

state = Recovery.create([{ kind: 'direct-play' }, { kind: 'direct-stream' }, { kind: 'transcode' }]);
state = Recovery.start(state, 37);
state = Recovery.rebuild(state, 12);
assert.strictEqual(state.position, 12, 'a reconstructed seek must preserve the requested absolute position');
assert.strictEqual(state.index, 0, 'a reconstructed seek must keep the current Direct Play strategy sticky');
assert.strictEqual(Recovery.current(state).kind, 'direct-play', 'a reconstructed Direct Play seek must not consume Direct Stream as generic recovery');
assert.strictEqual(state.status, 'retrying', 'a same-strategy reconstruction must be ready to start immediately');

state = Recovery.rebuild(state, 24);
assert.strictEqual(state.index, 0, 'repeated Direct Play reconstruction must retain the current strategy');
assert.strictEqual(state.position, 24, 'a repeated reconstruction must update its absolute position');

console.log('Playback recovery checks passed');
