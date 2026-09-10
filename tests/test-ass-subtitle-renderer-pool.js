'use strict';

var assert = require('assert');
var Pool = require('../app/ass-subtitle-renderer-pool');

(function prewarmCreatesOnePersistentRendererAndLeaseReleaseDoesNotDestroyIt() {
  var created = 0;
  var loads = [];
  var hidden = 0;
  var suspended = 0;
  var destroyed = 0;
  var renderer = {
    load: function (content, callback) { loads.push(content); callback(null); },
    setTime: function () {}, setSize: function () {}, show: function () {},
    hide: function () { hidden += 1; }, suspend: function () { suspended += 1; }, resize: function () {},
    dispose: function () { destroyed += 1; }
  };
  var pool = Pool.create({
    rendererModule: { create: function () { created += 1; return renderer; } },
    root: {}, document: {}
  });
  var first;
  var second;
  pool.prewarm();
  pool.prewarm();
  first = pool.create({ onRuntimeError: function () {} });
  second = pool.create({ onRuntimeError: function () {} });
  assert.strictEqual(created, 1, 'prewarm and leases must share one renderer');
  assert.strictEqual(loads.length, 1, 'prewarm must run once');
  assert.ok(/^\[Script Info\]/.test(loads[0]), 'prewarm must load a minimal valid ASS document');
  assert.ok(/Dialogue:.*Ploff/.test(loads[0]), 'prewarm must exercise one fallback-font glyph render');
  first.dispose();
  assert.strictEqual(destroyed, 0, 'releasing playback must keep the warm worker alive');
  assert.strictEqual(suspended, 1, 'releasing playback must suspend the warm worker so hidden lookahead cannot continue');
  assert.strictEqual(hidden, 0, 'pool release must delegate hide/pause/queue invalidation to renderer suspend when available');
  second.load('real ass', function () {});
  assert.strictEqual(loads[1], 'real ass');
  pool.destroy();
  assert.strictEqual(destroyed, 1, 'application teardown must terminate the worker');
}());

(function failedPrewarmDoesNotPreventLaterTrackRetry() {
  var attempts = 0;
  var renderer = {
    load: function (_content, callback) { attempts += 1; callback(attempts === 1 ? new Error('warmup failed') : null); },
    hide: function () {}, dispose: function () {}
  };
  var pool = Pool.create({ rendererModule: { create: function () { return renderer; } } });
  var loadError = new Error('not called');
  pool.prewarm();
  pool.create().load('real ass', function (error) { loadError = error; });
  assert.strictEqual(attempts, 2, 'real tracks must retry after a background warmup failure');
  assert.strictEqual(loadError, null);
}());

(function serializesTrackLoadsAndKeepsOnlyNewestPendingTrack() {
  var calls = [];
  var completions = [];
  var renderer = {
    load: function (content, callback) { calls.push(content); completions.push(callback); },
    hide: function () {}, dispose: function () {}
  };
  var pool = Pool.create({ rendererModule: { create: function () { return renderer; } } });
  var errors = [];
  var lease = pool.create();
  lease.load('A', function () {});
  lease.load('B', function (error) { errors.push(error); });
  lease.load('C', function () {});
  assert.deepStrictEqual(calls, ['A'], 'a second track must wait for the active worker mutation');
  assert.strictEqual(errors.length, 1, 'a superseded pending track must settle its callback');
  assert.strictEqual(errors[0].cancelled, true, 'a superseded pending track must be marked cancelled');
  completions[0](null);
  assert.deepStrictEqual(calls, ['A', 'C'], 'only the newest pending track may reach the worker');
  completions[1](null);
}());

(function equalTrackLoadsShareOneWorkerMutation() {
  var callbacks = [];
  var renderer = {
    load: function (_content, callback) { callbacks.push(callback); },
    hide: function () {}, dispose: function () {}
  };
  var pool = Pool.create({ rendererModule: { create: function () { return renderer; } } });
  var completions = 0;
  var lease = pool.create();
  lease.load('same', function () { completions += 1; });
  lease.load('same', function () { completions += 1; });
  assert.strictEqual(callbacks.length, 1, 'equal track loads must be coalesced');
  callbacks[0](null);
  assert.strictEqual(completions, 2, 'coalesced callers must all complete');
}());

(function preparedTrackIsReusedByPlaybackLease() {
  var calls = [];
  var completions = [];
  var renderer = {
    load: function (content, callback) { calls.push(content); completions.push(callback); },
    hide: function () {}, dispose: function () {}
  };
  var pool = Pool.create({ rendererModule: { create: function () { return renderer; } } });
  var prepareError = new Error('prepare callback not called');
  var loadError = new Error('load callback not called');
  var lease = pool.create();
  assert.strictEqual(pool.prepare('prepared', 'media|track', function (error) { prepareError = error; }), true,
    'the pool must accept a hidden preparation load');
  assert.deepStrictEqual(calls, ['prepared'], 'preparation must send the ASS track through the worker once');
  completions.shift()(null);
  assert.strictEqual(prepareError, null, 'preparation must settle successfully');
  lease.load('prepared', function (error) { loadError = error; });
  assert.strictEqual(loadError, null, 'playback must complete immediately for an already prepared track');
  assert.deepStrictEqual(calls, ['prepared'], 'playback must reuse the prepared worker track');
  pool.destroy();
}());


(function fullWorkerWarmupDoesNotBlockRealTrackPreparationBehindARedundantWarmTrack() {
  var libraryWarmups = 0;
  var libraryWarmupComplete = null;
  var loads = [];
  var renderer = {
    prewarm: function (callback) { libraryWarmups += 1; libraryWarmupComplete = callback; },
    load: function (content, callback) { loads.push(content); callback(null); },
    hide: function () {}, dispose: function () {}
  };
  var pool = Pool.create({ rendererModule: { create: function () { return renderer; } } });
  var prepared = false;
  assert.strictEqual(pool.prewarm(), true, 'pool prewarm must still start main-thread ASS library preparation');
  assert.strictEqual(libraryWarmups, 1, 'pool prewarm must use the renderer library-only prewarm when available');
  assert.deepStrictEqual(loads, [], 'full worker warmup from the head must make a second warm ASS track mutation redundant');
  pool.prepare('real ass', 'media|track', function (error) { assert.ifError(error); prepared = true; });
  assert.deepStrictEqual(loads, ['real ass'], 'real ASS preparation must start immediately even while library prewarm callback is pending');
  assert.strictEqual(prepared, true, 'real ASS preparation must not wait for an obsolete warm-track load');
  libraryWarmupComplete(null);
  pool.destroy();
}());

console.log('ASS subtitle renderer pool checks passed');
