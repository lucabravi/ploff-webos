'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var StartupRuntime = require('../app/startup-metrics');

(function legacyWorkerStartsOnceWarmsAfterRequestAndIsTransferredToRenderer() {
  var created = [];
  var metricMarks = [];
  var workerTiming = [];
  var timestamps = [10, 12, 20, 25, 30, 35, 40];
  function FakeWorker(url) {
    this.url = url;
    this.listeners = {};
    this.terminated = 0;
    created.push(this);
  }
  FakeWorker.prototype.addEventListener = function (name, callback) { this.listeners[name] = callback; };
  FakeWorker.prototype.removeEventListener = function (name, callback) {
    if (this.listeners[name] === callback) { delete this.listeners[name]; }
  };
  FakeWorker.prototype.postMessage = function (message) { this.messages = this.messages || []; this.messages.push(message); };
  FakeWorker.prototype.terminate = function () { this.terminated += 1; };

  var preloader = StartupRuntime.createAssWorkerPreloader({
    root: { Worker: FakeWorker },
    workerUrl: 'vendor/legacy.js?v=test',
    metrics: {
      mark: function (name) { metricMarks.push(name); },
      recordWorkerTiming: function (phase) { workerTiming.push(phase); }
    },
    now: function () { return timestamps.shift(); }
  });

  assert.strictEqual(preloader.start(), true, 'legacy preload must create the worker before libass construction');
  assert.strictEqual(preloader.start(), false, 'legacy preload must never create a second worker');
  assert.strictEqual(created.length, 1, 'legacy preload must own exactly one worker');
  assert.strictEqual(created[0].url, 'vendor/legacy.js?v=test');
  assert.strictEqual(created[0].messages.length, 1, 'legacy preload must initialize libass without starting a synthetic glyph render');
  assert.strictEqual(created[0].messages[0].target, 'worker-init', 'preloader must send worker-init before the application renderer exists');
  assert.strictEqual(created[0].messages[0].preMain, true, 'early worker-init must be accepted before Emscripten main');
  assert.strictEqual(/Dialogue:/i.test(created[0].messages[0].subContent), true,
    'bootstrap track must contain one synthetic glyph so post-Home warmup can exercise the expensive libass raster path');
  assert.strictEqual(created[0].messages[0].fallbackFont, 'default.woff2?v=4.1.0-os', 'full preload must start the packaged fallback font load');
  assert.deepStrictEqual(preloader.snapshot(), {
    workerUrl: 'vendor/legacy.js?v=test', started: true, available: true, failed: false,
    requestedAt: 10, initSentAt: 12, workerReadyAt: null, firstFrameAt: null, takenAt: null,
    warmStepCount: 0, warmChunkCount: 0, warmTotalMs: 0, warmMaxMs: 0, warmComplete: false
  }, 'preload timings must remain inspectable for cold-start diagnosis');
  created[0].listeners.message({ data: { target: 'ploff-ass-timing', phase: 'font-loaded' } });
  assert.deepStrictEqual(workerTiming, ['font-loaded'],
    'head preloader must forward the dedicated worker timing protocol before ownership transfers to the renderer');
  assert.deepStrictEqual(metricMarks.slice(0, 3), ['workerRequested', 'workerCreated', 'workerInitSent'],
    'head preloader must publish its startup milestones without URL or track identity data');
  created[0].listeners.message({ data: { target: 'ready' } });
  assert.deepStrictEqual(preloader.snapshot(), {
    workerUrl: 'vendor/legacy.js?v=test', started: true, available: true, failed: false,
    requestedAt: 10, initSentAt: 12, workerReadyAt: 20, firstFrameAt: null, takenAt: null,
    warmStepCount: 0, warmChunkCount: 0, warmTotalMs: 0, warmMaxMs: 0, warmComplete: false
  }, 'preloader must distinguish worker/runtime readiness from the deferred synthetic glyph render');

  assert.strictEqual(preloader.warm(), true, 'Home-ready warmup must start exactly one synthetic render sequence');
  assert.strictEqual(preloader.warm(), false, 'Home-ready warmup must be one-shot');
  assert.strictEqual(created[0].messages.length, 2, 'warmup must queue exactly one visible glyph render');
  assert.deepStrictEqual(created[0].messages[1], { target: 'ploff-warm-step', index: 1, time: 0.05, last: true },
    'single warm step must render inside the synthetic Dialogue validity window and complete the warmup');
  created[0].listeners.message({ data: {
    target: 'ploff-ass-warm-step', index: 1, libassMs: 7000,
    warmStepCount: 1, warmTotalMs: 7000, warmMaxMs: 7000, warmComplete: true
  } });
  assert.strictEqual(created[0].messages.length, 2, 'completed one-step warmup must not enqueue a synthetic clear render');
  assert.deepStrictEqual(preloader.snapshot(), {
    workerUrl: 'vendor/legacy.js?v=test', started: true, available: true, failed: false,
    requestedAt: 10, initSentAt: 12, workerReadyAt: 20, firstFrameAt: 25, takenAt: null,
    warmStepCount: 1, warmChunkCount: 0, warmTotalMs: 7000, warmMaxMs: 7000, warmComplete: true
  }, 'warmup metrics must expose the real synthetic libass render cost before playback takes ownership');

  var claim = preloader.take('vendor/legacy.js?v=test');
  assert.strictEqual(claim.worker, created[0], 'renderer must receive the already initialized worker');
  assert.strictEqual(claim.initialized, true, 'renderer must know worker-init was already sent');
  assert.strictEqual(/Dialogue:/i.test(claim.subContent), true, 'worker handoff must describe the synthetic bootstrap track already loaded');
  assert.strictEqual(created[0].messages[created[0].messages.length - 1].target, 'ploff-warm-cancel',
    'claiming the speculative worker must keep the adoption guard that suppresses a bootstrap resize render');
  assert.strictEqual(preloader.take('vendor/legacy.js?v=test'), null, 'preloaded worker ownership may transfer only once');
  assert.strictEqual(created[0].listeners.error, undefined, 'temporary preload error listener must be removed on transfer');
  assert.deepStrictEqual(preloader.snapshot(), {
    workerUrl: 'vendor/legacy.js?v=test', started: true, available: false, failed: false,
    requestedAt: 10, initSentAt: 12, workerReadyAt: 20, firstFrameAt: 25, takenAt: 30,
    warmStepCount: 1, warmChunkCount: 0, warmTotalMs: 7000, warmMaxMs: 7000, warmComplete: true
  });
  preloader.destroy();
  assert.strictEqual(created[0].terminated, 0, 'destroy after transfer must not terminate the renderer-owned worker');
}());

(function rendererClaimDuringFirstWarmStepPreventsFurtherSyntheticWork() {
  var worker;
  function FakeWorker() { worker = this; this.listeners = {}; this.messages = []; }
  FakeWorker.prototype.addEventListener = function (name, callback) { this.listeners[name] = callback; };
  FakeWorker.prototype.removeEventListener = function (name, callback) { if (this.listeners[name] === callback) { delete this.listeners[name]; } };
  FakeWorker.prototype.postMessage = function (message) { this.messages.push(message); };
  var preloader = StartupRuntime.createAssWorkerPreloader({ root: { Worker: FakeWorker }, workerUrl: 'worker.js' });
  preloader.start();
  assert.strictEqual(preloader.warm(), true);
  assert.strictEqual(worker.messages.filter(function (message) { return message.target === 'ploff-warm-step'; }).length, 1);
  assert.ok(preloader.take('worker.js'), 'playback must be able to claim the worker while the first warm render is in flight');
  assert.strictEqual(worker.messages[worker.messages.length - 1].target, 'ploff-warm-cancel',
    'playback claim must cancel any remaining synthetic warm work');
  assert.strictEqual(worker.listeners.message, undefined,
    'detaching preload listeners must make a late one-step warm response unable to affect playback ownership');
}());

(function modernWebAssemblyBrowsersDoNotPayLegacyPreloadCost() {
  var created = 0;
  function FakeWorker() { created += 1; }
  function Module() {}
  function Instance(module) { this.module = module; }
  var root = {
    Worker: FakeWorker,
    WebAssembly: {
      instantiate: function () {},
      Module: Module,
      Instance: Instance
    },
    Uint8Array: Uint8Array
  };
  var originalModule = root.WebAssembly.Module;
  root.WebAssembly.Module = function (bytes) {
    var module = new originalModule();
    module.bytes = bytes;
    return module;
  };
  root.WebAssembly.Module.prototype = originalModule.prototype;
  root.WebAssembly.Instance = function (module) {
    var instance = new Instance(module);
    Object.setPrototypeOf(instance, root.WebAssembly.Instance.prototype);
    return instance;
  };
  root.WebAssembly.Instance.prototype = Instance.prototype;

  var preloader = StartupRuntime.createAssWorkerPreloader({ root: root });
  assert.strictEqual(preloader.start(), false, 'WebAssembly-capable browsers must keep the normal WASM path');
  assert.strictEqual(created, 0, 'legacy worker must not be created on modern browsers');
}());

(function failedPreloadFallsBackToNormalWorkerConstruction() {
  var worker;
  function FakeWorker() {
    worker = this;
    this.listeners = {};
    this.terminated = 0;
  }
  FakeWorker.prototype.addEventListener = function (name, callback) { this.listeners[name] = callback; };
  FakeWorker.prototype.removeEventListener = function () {};
  FakeWorker.prototype.postMessage = function () {};
  FakeWorker.prototype.terminate = function () { this.terminated += 1; };
  var preloader = StartupRuntime.createAssWorkerPreloader({ root: { Worker: FakeWorker } });
  preloader.start();
  worker.listeners.error(new Error('parse failed'));
  assert.strictEqual(preloader.take(), null, 'failed speculative preload must not poison later subtitle startup');
  assert.strictEqual(worker.terminated, 1, 'failed speculative worker must be released before fallback');
  assert.strictEqual(preloader.snapshot().failed, true);
}());

(function browserScriptAutoStartsBeforeTheMainApplicationScriptsWhenGlobalAssIsEnabled() {
  var source = fs.readFileSync(path.join(__dirname, '..', 'app', 'startup-metrics.js'), 'utf8');
  var index = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
  var created = 0;
  function FakeWorker() { created += 1; this.addEventListener = function () {}; this.postMessage = function () {}; }
  var sandbox = { Worker: FakeWorker, WebAssembly: undefined, Uint8Array: Uint8Array, Date: Date, console: console, localStorage: { getItem: function (key) { return key === 'ploff.settings.v3' ? JSON.stringify({ subtitleRenderingAss: true }) : null; } } };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'startup-metrics.js' });
  assert.ok(sandbox.PloffAssSubtitleWorkerPreloader, 'browser preload script must publish its one-shot worker owner');
  assert.strictEqual(created, 1, 'browser preload script must start immediately when loaded and global ASS rendering is enabled');
  assert.notStrictEqual(index.indexOf('startup-metrics.js'), -1,
    'the TV page must load the startup runtime that owns the legacy worker preloader');
  assert.ok(index.indexOf('startup-metrics.js') < index.indexOf('vendor/webOSTV.js'),
    'legacy worker preload must start before the webOS helper so parsing overlaps all remaining startup work');
  assert.ok(index.indexOf('startup-metrics.js') < index.indexOf('styles.css?v=dev'),
    'legacy worker preload must start before stylesheet loading can delay blocking script execution');
}());

(function browserScriptSkipsWorkerConstructionWhenGlobalAssIsDisabled() {
  var source = fs.readFileSync(path.join(__dirname, '..', 'app', 'startup-metrics.js'), 'utf8');
  var created = 0;
  function FakeWorker() { created += 1; this.addEventListener = function () {}; this.postMessage = function () {}; }
  var sandbox = {
    Worker: FakeWorker, WebAssembly: undefined, Uint8Array: Uint8Array, Date: Date, console: console,
    localStorage: { getItem: function (key) { return key === 'ploff.settings.v3' ? JSON.stringify({ subtitleRenderingAss: false }) : null; } }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'startup-metrics.js' });
  assert.ok(sandbox.PloffAssSubtitleWorkerPreloader, 'disabled ASS must still publish the lazy preloader owner for later global enablement');
  assert.strictEqual(created, 0, 'disabled global ASS rendering must not construct the speculative worker at startup');
}());

console.log('ASS legacy worker preloader checks passed');
