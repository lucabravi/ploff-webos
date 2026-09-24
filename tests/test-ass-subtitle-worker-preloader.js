'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var StartupRuntime = require('../app/startup-metrics');

(function progressiveWarmupProducesPixelsAndYieldsToPlayback() {
  var worker;
  var timers = [];
  var draws = 0;
  function Worker() { worker = this; this.listeners = {}; this.messages = []; }
  Worker.prototype.addEventListener = function (name, fn) { this.listeners[name] = fn; };
  Worker.prototype.removeEventListener = function (name) { delete this.listeners[name]; };
  Worker.prototype.postMessage = function (message) { this.messages.push(message); };
  var preloader = StartupRuntime.createAssWorkerPreloader({ root: {
    Worker: Worker,
    setTimeout: function (fn) { timers.push(fn); return timers.length; },
    clearTimeout: function (id) { timers[id - 1] = null; },
    document: { createElement: function () { return { getContext: function () { return {
      createImageData: function (w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
      putImageData: function () {}, drawImage: function () { draws += 1; }
    }; } }; } }
  } });
  preloader.start();
  assert.strictEqual((worker.messages[0].subContent.match(/Dialogue:/g) || []).length, 7);
  preloader.warm();
  var listener = worker.listeners.message;
  function reply(index) { listener({ data: {
    target: 'ploff-ass-warm-step', index: index, warmStepCount: index,
    warmTotalMs: index * 10, warmMaxMs: 10, libassMs: 8, blendMs: 2,
    warmComplete: index === 5, pixelCount: 1,
    canvases: [{ w: 1, h: 1, buffer: new Uint8Array([255,255,255,255]).buffer }]
  } }); }
  reply(1);
  assert.strictEqual(draws, 1, 'warm bitmap must exercise canvas upload and drawing offscreen');
  assert.strictEqual(worker.messages.length, 2, 'next render must yield to the main event loop');
  timers.shift()();
  assert.strictEqual(worker.messages[2].index, 2);
  assert.strictEqual(worker.messages[2].time, 1.05);
  reply(2);
  var pending = timers[0];
  assert.ok(preloader.take(), 'real playback can claim the same worker between warm steps');
  pending();
  reply(3);
  assert.strictEqual(worker.messages.filter(function (m) { return m.target === 'ploff-warm-step'; }).length, 2,
    'queued and late callbacks cannot resume speculation after handoff');
  assert.strictEqual(preloader.snapshot().warmComplete, false);
}());

(function completeWarmupRequiresFivePixelBearingCanvasDraws() {
  [false, true, 'draw-error', 'cancel', 'destroy'].forEach(function (mode) {
    var worker;
    var timers = [];
    var terminated = 0;
    function Worker() { worker = this; this.listeners = {}; this.messages = []; }
    Worker.prototype.addEventListener = function (name, fn) { this.listeners[name] = fn; };
    Worker.prototype.removeEventListener = function (name) { delete this.listeners[name]; };
    Worker.prototype.postMessage = function (message) { this.messages.push(message); };
    Worker.prototype.terminate = function () { terminated += 1; };
    var preloader = StartupRuntime.createAssWorkerPreloader({ root: {
      Worker: Worker, setTimeout: function (fn) { timers.push(fn); return timers.length; }, clearTimeout: function () {},
      document: { createElement: function () { return { getContext: function () { return {
        createImageData: function (w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
        putImageData: function () { if (mode === 'draw-error') { throw new Error('canvas unavailable'); } }, drawImage: function () {}
      }; } }; } }
    } });
    preloader.start(); preloader.warm();
    var listener = worker.listeners.message;
    for (var i = 1; i <= 7; i += 1) {
      listener({ data: { target: 'ploff-ass-warm-step', index: i, warmComplete: i === 7,
        warmStepCount: i, pixelCount: mode === true && i === 3 ? 0 : 1,
        canvases: mode === true && i === 3 ? [] : [{ w: 1, h: 1, buffer: new Uint8Array([255,255,255,255]).buffer }]
      } });
      if (i === 1 && (mode === 'cancel' || mode === 'destroy')) {
        if (mode === 'cancel') { preloader.cancelWarmup(); }
        else { preloader.destroy(); }
        timers.shift()();
        assert.strictEqual(worker.messages.filter(function (m) { return m.target === 'ploff-warm-step'; }).length, 1, 'cancelled callback must not enqueue work');
        assert.strictEqual(preloader.warm(), false);
        if (mode === 'cancel') { assert.ok(preloader.take(), 'cancel leaves worker available for real playback'); }
        assert.strictEqual(terminated, mode === 'destroy' ? 1 : 0);
        return;
      }
      if (i < 7) { timers.shift()(); }
    }
    assert.strictEqual(preloader.snapshot().warmComplete, mode === false);
    assert.strictEqual(timers.length, 0, 'completed sequence owns no outstanding timer');
    assert.strictEqual(worker.messages.length, 8, 'initialization plus exactly seven diagnostic warm requests');
    assert.strictEqual(worker.messages[7].last, true);
    assert.strictEqual(preloader.snapshot().warmSteps.length, 7);
    preloader.snapshot().warmSteps[0].pixelCount = 999;
    assert.strictEqual(preloader.snapshot().warmSteps[0].pixelCount, 1, 'snapshots must not mutate internal evidence');
  });
}());

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
  assert.strictEqual(created[0].messages[0].fallbackFont, 'default.ttf?v=4.1.0-os', 'full preload must start the packaged fallback font load');
  assert.deepStrictEqual([created[0].messages[0].width, created[0].messages[0].height], [1920, 1080],
    'warmup must use the same full raster scale as real ASS rendering');
  assert.deepStrictEqual(preloader.snapshot(), {
    workerUrl: 'vendor/legacy.js?v=test', started: true, available: true, failed: false,
    requestedAt: 10, initSentAt: 12, workerReadyAt: null, firstFrameAt: null, takenAt: null,
    warmStepCount: 0, warmChunkCount: 0, warmStartedAt: null, warmTotalMs: 0, warmMaxMs: 0, warmComplete: false, warmSteps: []
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
    warmStepCount: 0, warmChunkCount: 0, warmStartedAt: null, warmTotalMs: 0, warmMaxMs: 0, warmComplete: false, warmSteps: []
  }, 'preloader must distinguish worker/runtime readiness from the deferred synthetic glyph render');

  assert.strictEqual(preloader.warm(), true, 'Home-ready warmup must start exactly one synthetic render sequence');
  assert.strictEqual(preloader.warm(), false, 'Home-ready warmup must be one-shot');
  assert.strictEqual(created[0].messages.length, 2, 'warmup must queue exactly one visible glyph render');
  assert.deepStrictEqual(created[0].messages[1], { target: 'ploff-warm-step', index: 1, time: 0.05, last: false },
    'first warm step must render inside its synthetic Dialogue validity window');
  created[0].listeners.message({ data: {
    target: 'ploff-ass-warm-step', index: 1, libassMs: 7000, pixelCount: 10,
    warmStepCount: 1, warmTotalMs: 7000, warmMaxMs: 7000, warmComplete: true
  } });
  assert.strictEqual(created[0].messages.length, 2, 'completed one-step warmup must not enqueue a synthetic clear render');
  assert.deepStrictEqual(preloader.snapshot(), {
    workerUrl: 'vendor/legacy.js?v=test', started: true, available: true, failed: false,
    requestedAt: 10, initSentAt: 12, workerReadyAt: 20, firstFrameAt: 25, takenAt: null,
    warmStepCount: 1, warmChunkCount: 0, warmStartedAt: null, warmTotalMs: 7000, warmMaxMs: 7000, warmComplete: false,
    warmSteps: [{ index: 1, libassMs: 7000, blendMs: 0, drawMs: null, pixelCount: 10 }]
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
    warmStepCount: 1, warmChunkCount: 0, warmStartedAt: null, warmTotalMs: 7000, warmMaxMs: 7000, warmComplete: false,
    warmSteps: [{ index: 1, libassMs: 7000, blendMs: 0, drawMs: null, pixelCount: 10 }]
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


(function preloaderLifecycleCanBeObservedWithoutOwningAnApplicationTimer() {
  var worker;
  var snapshots = [];
  function FakeWorker() { worker = this; this.listeners = {}; this.messages = []; }
  FakeWorker.prototype.addEventListener = function (name, callback) { this.listeners[name] = callback; };
  FakeWorker.prototype.removeEventListener = function (name, callback) { if (this.listeners[name] === callback) { delete this.listeners[name]; } };
  FakeWorker.prototype.postMessage = function (message) { this.messages.push(message); };
  var preloader = StartupRuntime.createAssWorkerPreloader({ root: { Worker: FakeWorker }, workerUrl: 'worker.js' });
  assert.strictEqual(typeof preloader.subscribe, 'function', 'ASS preloader must expose lifecycle subscription instead of requiring application polling');
  var unsubscribe = preloader.subscribe(function () { snapshots.push(preloader.snapshot()); });
  preloader.start();
  preloader.warm();
  assert.ok(snapshots.length > 0, 'starting warm work must publish a lifecycle change');
  preloader.take('worker.js');
  assert.ok(snapshots.some(function (snapshot) { return snapshot.available === false && snapshot.takenAt !== null; }),
    'worker handoff must publish the lifecycle transition that ends startup pressure');
  var count = snapshots.length;
  unsubscribe();
  if (worker.listeners.error) { worker.listeners.error(new Error('late')); }
  assert.strictEqual(snapshots.length, count, 'unsubscribe must detach the lifecycle observer');
}());


(function lifecycleSubscriberObservesRealWarmCompletion() {
  var worker;
  var timers = [];
  var completed = false;
  function FakeWorker() { worker = this; this.listeners = {}; this.messages = []; }
  FakeWorker.prototype.addEventListener = function (name, callback) { this.listeners[name] = callback; };
  FakeWorker.prototype.removeEventListener = function (name, callback) { if (this.listeners[name] === callback) { delete this.listeners[name]; } };
  FakeWorker.prototype.postMessage = function (message) { this.messages.push(message); };
  var preloader = StartupRuntime.createAssWorkerPreloader({ root: {
    Worker: FakeWorker,
    setTimeout: function (fn) { timers.push(fn); return timers.length; },
    clearTimeout: function () {},
    document: { createElement: function () { return { getContext: function () { return {
      createImageData: function (w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
      putImageData: function () {},
      drawImage: function () {}
    }; } }; } }
  }, workerUrl: 'worker.js' });
  preloader.subscribe(function () {
    if (preloader.snapshot().warmComplete) { completed = true; }
  });
  preloader.start();
  preloader.warm();
  for (var index = 1; index <= 7; index += 1) {
    worker.listeners.message({ data: {
      target: 'ploff-ass-warm-step', index: index, warmStepCount: index,
      warmComplete: index === 7, pixelCount: 1,
      canvases: [{ w: 1, h: 1, buffer: new Uint8Array([255,255,255,255]).buffer }]
    } });
    if (index < 7) { timers.shift()(); }
  }
  assert.strictEqual(preloader.snapshot().warmComplete, true, 'real seven-step ASS warmup must complete');
  assert.strictEqual(completed, true, 'lifecycle subscribers must observe the real warm-complete transition');
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
