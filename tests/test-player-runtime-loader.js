'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var Loader = require('../app/player-runtime-loader');

function fixture(options) {
  var root = {};
  var scripts = [];
  var removed = [];
  var events = [];
  var parent = {
    appendChild: function (script) { scripts.push(script); script.parentNode = parent; },
    removeChild: function (script) { removed.push(script); script.parentNode = null; }
  };
  var document = {
    head: parent,
    createElement: function (name) { assert.strictEqual(name, 'script'); return {}; },
    getElementsByTagName: function (name) {
      assert.strictEqual(name, 'script');
      return [{ getAttribute: function () { return 'app.js?v=1.0.7-abcd1234'; } }];
    }
  };
  var values = Object.assign({
    root: root, document: document,
    onLoadStart: function () { events.push('start'); },
    onCodeReady: function () { events.push('ready'); }
  }, options || {});
  return { root: root, scripts: scripts, removed: removed, events: events, document: document, loader: Loader.create(values) };
}

(function idleLoadingReadyAndCoalescing() {
  var f = fixture();
  var module = { create: function () {} };
  var calls = [];
  function done(error, composition) { assert.strictEqual(error, null); assert.strictEqual(composition, module); calls.push('done'); }
  assert.deepStrictEqual(f.loader.snapshot(), { state: 'idle', pendingCount: 0 });
  f.loader.ensure(done);
  f.loader.ensure(done);
  assert.strictEqual(f.scripts.length, 1);
  assert.strictEqual(f.scripts[0].src, 'player.js?v=1.0.7-abcd1234', 'deferred code must share the current app asset cache identity');
  assert.strictEqual(f.scripts[0].async, true);
  assert.deepStrictEqual(f.loader.snapshot(), { state: 'loading', pendingCount: 2 });
  assert.deepStrictEqual(f.events, ['start']);
  var lateLoad = f.scripts[0].onload;
  var lateError = f.scripts[0].onerror;
  f.root.PloffPlayerComposition = module;
  lateLoad(); lateLoad(); lateError();
  assert.strictEqual(calls.length, 2);
  assert.deepStrictEqual(f.loader.snapshot(), { state: 'ready', pendingCount: 0 });
  assert.deepStrictEqual(f.events, ['start', 'ready']);
  assert.strictEqual(f.removed.length, 1);
  assert.strictEqual(f.scripts[0].onload, null);
  assert.strictEqual(f.scripts[0].onerror, null);
  f.loader.ensure(done);
  assert.strictEqual(calls.length, 3, 'already-ready callbacks must run synchronously');
  assert.strictEqual(f.scripts.length, 1);
  assert.strictEqual(f.loader.reset(), false, 'ready code must not be reinjected');
}());

(function preloadedCompositionNeedsNoDocumentOrScript() {
  var module = { create: function () {} };
  var starts = 0;
  var ready = 0;
  var calls = 0;
  var loader = Loader.create({ root: { PloffPlayerComposition: module },
    onLoadStart: function () { starts += 1; }, onCodeReady: function () { ready += 1; } });
  loader.ensure(function (error, value) { assert.strictEqual(error, null); assert.strictEqual(value, module); calls += 1; });
  loader.ensure(function () { calls += 1; });
  assert.strictEqual(calls, 2); assert.strictEqual(starts, 0); assert.strictEqual(ready, 1);
}());

(function failedLoadsRemainFailedUntilExplicitResetAndIgnoreOldEvents() {
  var f = fixture({ url: 'player.js?v=custom' });
  var errors = [];
  function failed(error, value) { assert.ok(error instanceof Error); assert.strictEqual(value, null); errors.push(error); }
  f.loader.ensure(failed); f.loader.ensure(failed);
  var oldLoad = f.scripts[0].onload;
  var oldError = f.scripts[0].onerror;
  assert.strictEqual(f.loader.reset(), false, 'an in-flight load cannot be reset into a competing load');
  assert.strictEqual(f.scripts[0].src, 'player.js?v=custom');
  oldError({ message: 'https://secret-server/token=private' });
  f.loader.ensure(failed);
  assert.strictEqual(errors.length, 3);
  assert.strictEqual(errors[0], errors[1]); assert.strictEqual(errors[1], errors[2]);
  assert.strictEqual(errors[0].message, 'Player runtime could not be loaded');
  assert.strictEqual(f.scripts.length, 1);
  assert.deepStrictEqual(f.loader.snapshot(), { state: 'failed', pendingCount: 0 });
  assert.strictEqual(f.loader.reset(), true);
  var calls = 0;
  f.loader.ensure(function (error, module) { assert.strictEqual(error, null); assert.strictEqual(typeof module.create, 'function'); calls += 1; });
  assert.strictEqual(f.scripts.length, 2);
  oldLoad(); oldError();
  assert.strictEqual(f.loader.snapshot().state, 'loading'); assert.strictEqual(calls, 0);
  f.root.PloffPlayerComposition = { create: function () {} };
  f.scripts[1].onload();
  assert.strictEqual(calls, 1);
}());

(function missingOrInvalidCompositionFailsEvenWhenScriptLoads() {
  [undefined, {}, { create: true }].forEach(function (module) {
    var f = fixture(); var error;
    f.root.PloffPlayerComposition = module;
    f.loader.ensure(function (value) { error = value; });
    f.scripts[0].onload();
    assert.ok(error instanceof Error);
    assert.strictEqual(error.message, 'Player composition is unavailable');
    assert.strictEqual(f.loader.snapshot().state, 'failed');
    assert.deepStrictEqual(f.events, ['start']);
  });
}());

(function destructionSuppressesQueuedAndLateWork() {
  var f = fixture(); var calls = 0;
  f.loader.ensure(function () { calls += 1; });
  var lateLoad = f.scripts[0].onload; var lateError = f.scripts[0].onerror;
  f.loader.destroy(); f.loader.destroy();
  f.root.PloffPlayerComposition = { create: function () {} };
  lateLoad(); lateError();
  assert.strictEqual(calls, 0); assert.strictEqual(f.removed.length, 1);
  assert.deepStrictEqual(f.loader.snapshot(), { state: 'destroyed', pendingCount: 0 });
  assert.strictEqual(f.loader.reset(), false);
  f.loader.ensure(function (error, value) {
    assert.strictEqual(error.message, 'Player runtime loader is destroyed'); assert.strictEqual(value, null); calls += 1;
  });
  assert.strictEqual(calls, 1); assert.strictEqual(f.scripts.length, 1);
}());

(function synchronousDocumentFailuresSettleOnceAndDoNotLeakDetails() {
  [null, { createElement: function () { throw new Error('private'); } }, {
    createElement: function () { return {}; }, head: { appendChild: function () { throw new Error('private'); } }
  }].forEach(function (document) {
    var loader = Loader.create({ document: document }); var calls = 0;
    loader.ensure(function (error, value) {
      assert.strictEqual(error.message, 'Player runtime could not be loaded'); assert.strictEqual(value, null); calls += 1;
    });
    assert.strictEqual(calls, 1); assert.strictEqual(loader.snapshot().state, 'failed');
  });
}());

(function callbacksCanEnsureAgainWithoutReinjectingAndOneThrowCannotStarveOtherCallers() {
  var f = fixture(); var calls = [];
  var callbackError = new Error('consumer failure');
  f.loader.ensure(function () {
    calls.push('first');
    f.loader.ensure(function () { calls.push('reentrant'); });
    throw callbackError;
  });
  f.loader.ensure(function () { calls.push('second'); });
  f.root.PloffPlayerComposition = { create: function () {} };
  assert.throws(function () { f.scripts[0].onload(); }, function (error) { return error === callbackError; });
  assert.deepStrictEqual(calls, ['first', 'reentrant', 'second']);
  assert.strictEqual(f.scripts.length, 1); assert.strictEqual(f.loader.snapshot().state, 'ready');
}());

(function callbackDestroyStopsRemainingWaiters() {
  var f = fixture(); var calls = [];
  f.loader.ensure(function () { calls.push('first'); f.loader.destroy(); });
  f.loader.ensure(function () { calls.push('late'); });
  f.root.PloffPlayerComposition = { create: function () {} };
  f.scripts[0].onload();
  assert.deepStrictEqual(calls, ['first']);
  assert.strictEqual(f.loader.snapshot().state, 'destroyed');
}());

(function reentrantRetryDoesNotMixOldWaitersWithNewLoad() {
  var f = fixture(); var calls = [];
  f.loader.ensure(function (error) {
    assert.ok(error); calls.push('old-first');
    f.loader.reset();
    f.loader.ensure(function (retryError) { assert.strictEqual(retryError, null); calls.push('retry'); });
  });
  f.loader.ensure(function (error) { assert.ok(error); calls.push('old-second'); });
  f.scripts[0].onerror();
  assert.deepStrictEqual(calls, ['old-first', 'old-second']);
  assert.deepStrictEqual(f.loader.snapshot(), { state: 'loading', pendingCount: 1 });
  f.root.PloffPlayerComposition = { create: function () {} };
  f.scripts[1].onload();
  assert.deepStrictEqual(calls, ['old-first', 'old-second', 'retry']);
}());

(function metricsFailuresCannotBreakReadiness() {
  var f = fixture({ onLoadStart: function () { throw new Error('metrics'); }, onCodeReady: function () { throw new Error('metrics'); } });
  var calls = 0;
  f.loader.ensure(function (error) { assert.strictEqual(error, null); calls += 1; });
  f.root.PloffPlayerComposition = { create: function () {} };
  f.scripts[0].onload();
  assert.strictEqual(calls, 1);
}());

(function browserExportHasNoSideEffectsBeforeEnsure() {
  var context = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/player-runtime-loader.js'), 'utf8'), context);
  assert.strictEqual(typeof context.PloffPlayerRuntimeLoader.create, 'function');
  var loader = context.PloffPlayerRuntimeLoader.create({});
  assert.strictEqual(loader.snapshot().state, 'idle');
  loader.destroy();
}());

(function cacheIdentityAndRelativeLocationFollowTheAppScript() {
  [
    ['assets/app.js?v=1.0.7-123#ignored', 'assets/player.js?v=1.0.7-123'],
    ['file:///installed/ploff/app.js?v=stable', 'file:///installed/ploff/player.js?v=stable'],
    ['app.js', 'player.js']
  ].forEach(function (pair) {
    var f = fixture();
    f.document.getElementsByTagName = function () { return [{ src: pair[0] }]; };
    f.loader.ensure();
    assert.strictEqual(f.scripts[0].src, pair[1]);
    f.loader.destroy();
  });
}());

(function destroyingFromLoadStartPreventsInjection() {
  var loader;
  var f = fixture({ onLoadStart: function () { loader.destroy(); } });
  loader = f.loader;
  loader.ensure(function () { throw new Error('destroyed callback must be suppressed'); });
  assert.strictEqual(f.scripts.length, 0);
  assert.strictEqual(loader.snapshot().state, 'destroyed');
}());

(function synchronousLoadCompletionDoesNotConvertCallbackErrorsIntoLoadErrors() {
  var f = fixture();
  var expected = new Error('consumer');
  f.document.head.appendChild = function (script) {
    f.root.PloffPlayerComposition = { create: function () {} };
    script.onload();
  };
  assert.throws(function () { f.loader.ensure(function () { throw expected; }); }, function (error) { return error === expected; });
  assert.strictEqual(f.loader.snapshot().state, 'ready');
}());


(function falsyThrownValuesStillPropagateAfterDrainingWaiters() {
  [null, undefined, 0, ''].forEach(function (thrown) {
    var f = fixture(); var later = 0; var caught = false;
    f.loader.ensure(function () { throw thrown; });
    f.loader.ensure(function () { later += 1; });
    f.root.PloffPlayerComposition = { create: function () {} };
    try { f.scripts[0].onload(); } catch (error) { caught = true; assert.strictEqual(error, thrown); }
    assert.strictEqual(later, 1);
    assert.strictEqual(caught, true, 'all JavaScript thrown values must propagate after draining');
    f.loader.destroy();
  });
}());

console.log('Player runtime loader checks passed');
