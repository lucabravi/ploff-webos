'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var loaderPath = path.join(__dirname, '../app/diagnostics-support-runtime-loader.js');

assert.strictEqual(fs.existsSync(loaderPath), true, 'Diagnostics support runtime loader must exist');
var Loader = require(loaderPath);

function fixture(options) {
  var root = {};
  var scripts = [];
  var removed = [];
  var parent = {
    appendChild: function (script) { scripts.push(script); script.parentNode = parent; },
    removeChild: function (script) { removed.push(script); script.parentNode = null; }
  };
  var document = {
    head: parent,
    createElement: function (name) { assert.strictEqual(name, 'script'); return {}; },
    getElementsByTagName: function (name) {
      assert.strictEqual(name, 'script');
      return [{ getAttribute: function () { return 'assets/app.js?v=1.0.7-abcd1234'; } }];
    }
  };
  var values = options || {};
  values.root = values.root || root;
  values.document = values.document || document;
  return { root: values.root, document: values.document, scripts: scripts, removed: removed, loader: Loader.create(values) };
}

function installRuntime(root) {
  root.PloffSupportSnapshot = { create: function () {} };
  root.PloffSupportQr = { create: function () {}, render: function () {} };
}

(function coalescesOneLazyLoadAndSharesAppCacheIdentity() {
  var f = fixture();
  var calls = [];
  f.loader.ensure(function (error, runtime) { calls.push([error, runtime]); });
  f.loader.ensure(function (error, runtime) { calls.push([error, runtime]); });
  assert.strictEqual(f.scripts.length, 1, 'concurrent support requests must inject one script');
  assert.strictEqual(f.scripts[0].src, 'assets/support.js?v=1.0.7-abcd1234');
  assert.strictEqual(f.scripts[0].async, true);
  assert.deepStrictEqual(f.loader.snapshot(), { state: 'loading', pendingCount: 2 });
  installRuntime(f.root);
  f.scripts[0].onload();
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0][0], null);
  assert.strictEqual(calls[0][1].SupportSnapshot, f.root.PloffSupportSnapshot);
  assert.strictEqual(calls[0][1].SupportQr, f.root.PloffSupportQr);
  assert.strictEqual(calls[0][1], calls[1][1], 'all waiters must receive the same runtime projection');
  assert.deepStrictEqual(f.loader.snapshot(), { state: 'ready', pendingCount: 0 });
  assert.strictEqual(f.removed.length, 1, 'completed loader script must be detached');
}());

(function developmentPreloadedRuntimeNeedsNoInjection() {
  var root = {};
  var calls = 0;
  installRuntime(root);
  var loader = Loader.create({ root: root });
  loader.ensure(function (error, runtime) {
    assert.strictEqual(error, null);
    assert.strictEqual(runtime.SupportSnapshot, root.PloffSupportSnapshot);
    calls += 1;
  });
  loader.ensure(function () { calls += 1; });
  assert.strictEqual(calls, 2, 'development static modules must resolve synchronously');
  assert.strictEqual(loader.snapshot().state, 'ready');
}());

(function loadFailureIsBoundedAndResettable() {
  var f = fixture();
  var firstError = null;
  f.loader.ensure(function (error, runtime) { firstError = error; assert.strictEqual(runtime, null); });
  f.scripts[0].onerror({ message: 'token=secret' });
  assert.ok(firstError instanceof Error);
  assert.strictEqual(firstError.message, 'Diagnostics support runtime could not be loaded');
  assert.strictEqual(f.loader.snapshot().state, 'failed');
  assert.strictEqual(f.loader.reset(), true);
  f.loader.ensure(function (error, runtime) { assert.strictEqual(error, null); assert.ok(runtime); });
  assert.strictEqual(f.scripts.length, 2);
  installRuntime(f.root);
  f.scripts[1].onload();
  assert.strictEqual(f.loader.snapshot().state, 'ready');
}());

(function invalidRuntimeFailsClosed() {
  var f = fixture();
  var error = null;
  f.loader.ensure(function (value) { error = value; });
  f.root.PloffSupportSnapshot = { create: function () {} };
  f.root.PloffSupportQr = {};
  f.scripts[0].onload();
  assert.ok(error instanceof Error);
  assert.strictEqual(error.message, 'Diagnostics support runtime is unavailable');
  assert.strictEqual(f.loader.snapshot().state, 'failed');
}());

(function destroySuppressesLateCallbacksAndInjectionState() {
  var f = fixture();
  var calls = 0;
  f.loader.ensure(function () { calls += 1; });
  var lateLoad = f.scripts[0].onload;
  f.loader.destroy();
  installRuntime(f.root);
  lateLoad();
  assert.strictEqual(calls, 0);
  assert.deepStrictEqual(f.loader.snapshot(), { state: 'destroyed', pendingCount: 0 });
  f.loader.ensure(function (error, runtime) {
    assert.strictEqual(error.message, 'Diagnostics support runtime loader is destroyed');
    assert.strictEqual(runtime, null);
    calls += 1;
  });
  assert.strictEqual(calls, 1);
}());

(function browserExportHasNoSideEffectsBeforeEnsure() {
  var context = {};
  vm.runInNewContext(fs.readFileSync(loaderPath, 'utf8'), context);
  assert.strictEqual(typeof context.PloffDiagnosticsSupportRuntimeLoader.create, 'function');
  var loader = context.PloffDiagnosticsSupportRuntimeLoader.create({});
  assert.strictEqual(loader.snapshot().state, 'idle');
  assert.strictEqual(loader.snapshot().pendingCount, 0);
  loader.destroy();
}());

console.log('Diagnostics support runtime loader checks passed');
