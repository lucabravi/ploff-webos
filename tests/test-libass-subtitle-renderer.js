'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var Renderer = require('../app/libass-subtitle-renderer');

var canvas = { className: '', style: {}, width: 0, height: 0 };
var documentRef = { documentElement: { clientWidth: 1280, clientHeight: 720 } };
var created;
var instance;
var disposed = false;
var preloadedWorker = { id: 'legacy-preloaded-worker' };
var preloadedWorkerUrl = '';

function FakeSubtitlesOctopus(options) {
  created = options;
  instance = this;
  this.setCurrentTime = function (value) { this.currentTime = value; };
  this.setIsPaused = function (value, time) { this.paused = value; this.pausedAt = time; this.currentTime = time; };
  this.resize = function (width, height, top, left) { this.size = [width, height, top, left]; };
  this.dispose = function () { disposed = true; };
  options.onReady();
}

var renderer = Renderer.create({
  root: { SubtitlesOctopus: FakeSubtitlesOctopus },
  document: documentRef,
  canvas: canvas,
  videoDimensions: function () { return { width: 1920, height: 1080 }; },
  SubtitlesOctopus: FakeSubtitlesOctopus,
  workerPreloader: {
    take: function (url) {
      preloadedWorkerUrl = url;
      return { worker: preloadedWorker, initialized: true, subContent: '[Script Info]\nTitle: warm worker' };
    }
  }
});
var loadError;
renderer.load('[Script Info]\nTitle: test', function (error) { loadError = error; });

assert.strictEqual(loadError, null, 'ASS renderer must report readiness after the worker-backed instance is ready');
assert.strictEqual(created.renderMode, 'js-blend', 'renderer must use the Chrome 53-compatible JS blend path');
assert.strictEqual(created.debug, false, 'ASS renderer debug logging must stay disabled by default on production TVs');
assert.strictEqual(created.workerUrl, 'vendor/subtitles-octopus-worker.js?v=4.1.0-os&assSync=12&assWasm=1', 'renderer must use the protocol-compatible vendored WASM worker');
assert.strictEqual(created.legacyWorkerUrl, 'vendor/subtitles-octopus-worker-legacy.js?v=4.1.0-os-mem1&assTiming=1&assSync=12&assWarm=4', 'renderer must provide the diagnostic legacy worker fallback');
assert.strictEqual(preloadedWorkerUrl, created.legacyWorkerUrl, 'renderer must claim only the matching vendored legacy worker');
assert.strictEqual(created.worker, preloadedWorker, 'renderer must hand the already parsing legacy worker to SubtitlesOctopus');
assert.strictEqual(created.workerInitialized, true, 'renderer must preserve the preloader worker-init state');
assert.strictEqual(created.workerSubContent, '[Script Info]\nTitle: warm worker', 'renderer must describe the track already resident in the warm worker');
assert.strictEqual(created.fallbackFont, 'default.ttf?v=4.1.0-os',
  'renderer must resolve the packaged fallback font relative to its vendored worker');
assert.strictEqual(created.subContent, '[Script Info]\nTitle: test', 'renderer must pass subtitle content without a network fetch');
assert.strictEqual(created.video, undefined, 'renderer must not attach native video event listeners');
assert.deepStrictEqual([canvas.width, canvas.height], [1280, 720], 'renderer must rasterize at the UI viewport size');

renderer.setTime(42.5, true);
assert.strictEqual(instance.currentTime, 42.5, 'renderer must receive the absolute playback clock');
assert.strictEqual(instance.paused, true, 'renderer must receive the native paused state');
renderer.show();
assert.strictEqual(renderer.isVisible(), true, 'renderer visibility must be explicit');
renderer.hide();
assert.strictEqual(renderer.isVisible(), false, 'renderer hide must clear the overlay visibility');
renderer.dispose();

assert.strictEqual(disposed, true, 'renderer disposal must release the worker-backed instance');

var abandonedWorkerTerminations = 0;
var abandonedWorker = { terminate: function () { abandonedWorkerTerminations += 1; } };
function ThrowingSubtitlesOctopus() { throw new Error('constructor failed'); }
var failedConstructionRenderer = Renderer.create({
  root: { SubtitlesOctopus: ThrowingSubtitlesOctopus },
  document: documentRef,
  canvas: { className: '', style: {}, width: 0, height: 0 },
  SubtitlesOctopus: ThrowingSubtitlesOctopus,
  workerPreloader: { take: function () { return { worker: abandonedWorker, initialized: true, subContent: '' }; } }
});
var failedConstructionError = null;
failedConstructionRenderer.load('[Script Info]\nTitle: failed construction', function (error) { failedConstructionError = error; });
assert.ok(failedConstructionError, 'renderer must surface SubtitlesOctopus construction errors');
assert.strictEqual(abandonedWorkerTerminations, 1,
  'a claimed preloaded worker must be terminated if SubtitlesOctopus fails before taking ownership');
failedConstructionRenderer.dispose();

var clockSensitiveInstance;
function ClockSensitiveSubtitlesOctopus(options) {
  clockSensitiveInstance = this;
  this.renderedTime = 0;
  this.renderPending = false;
  this.setCurrentTime = function (value) {
    this.currentTime = value;
    if (!this.renderPending) {
      this.renderedTime = value;
      this.renderPending = true;
    }
  };
  this.setIsPaused = function (value, time) {
    this.setCurrentTime(time);
    this.renderPending = value !== true;
  };
  this.dispose = function () {};
  options.onReady();
}
var clockSensitiveRenderer = Renderer.create({
  root: { SubtitlesOctopus: ClockSensitiveSubtitlesOctopus },
  document: documentRef,
  canvas: { className: '', style: {}, width: 0, height: 0 },
  SubtitlesOctopus: ClockSensitiveSubtitlesOctopus
});
clockSensitiveRenderer.load('[Script Info]\nTitle: clock transition', function (error) { loadError = error; });
assert.strictEqual(loadError, null, 'clock-sensitive ASS renderer must initialize normally');
clockSensitiveInstance.renderedTime = 24.5;
clockSensitiveInstance.renderPending = true;
clockSensitiveRenderer.setTime(5.645, true);
assert.strictEqual(clockSensitiveInstance.renderedTime, 5.645,
  'pausing at a new confirmed clock must redraw the ASS canvas after cancelling its autonomous frame');
clockSensitiveRenderer.dispose();

var readinessCallbacks = [];
var readinessChecks = 0;
var readinessTimes = [];
var readinessPaused = [];
var delayedReadyResult = 'pending';
function DelayedReadySubtitlesOctopus(options) {
  this.dispose = function () {};
  this.setCurrentTime = function (value) { readinessTimes.push(value); };
  this.setIsPaused = function (value, time) { readinessPaused.push([value, time]); };
  this.getEvents = function (success, failure) {
    readinessChecks += 1;
    if (readinessChecks === 1) { failure(new Error('worker runtime is still loading')); return; }
    success([]);
  };
  options.onReady();
}
var delayedReadyRenderer = Renderer.create({
  root: {
    SubtitlesOctopus: DelayedReadySubtitlesOctopus,
    setTimeout: function (callback) { readinessCallbacks.push(callback); return readinessCallbacks.length; }
  },
  document: documentRef,
  canvas: { className: '', style: {}, width: 0, height: 0 },
  SubtitlesOctopus: DelayedReadySubtitlesOctopus
});
delayedReadyRenderer.load('[Script Info]\nTitle: delayed worker readiness', function (error) {
  delayedReadyResult = error || null;
});
assert.strictEqual(delayedReadyResult, 'pending',
  'the renderer must not report readiness before the libass worker answers an API request');
assert.strictEqual(readinessCallbacks.length, 1, 'a worker that is still initializing must schedule a bounded readiness retry');
delayedReadyRenderer.setTime(91.25, true);
assert.deepStrictEqual(readinessTimes, [], 'clock updates must remain accumulated while the libass worker is not responsive');
assert.deepStrictEqual(readinessPaused, [], 'pause updates must remain accumulated while the libass worker is not responsive');
readinessCallbacks.shift()();
assert.strictEqual(delayedReadyResult, null, 'the renderer must become ready once the libass worker answers');
assert.deepStrictEqual(readinessPaused, [[true, 91.25]], 'readiness must apply the latest accumulated pause state once');
assert.deepStrictEqual(readinessTimes, [], 'readiness must not send a duplicate current-time message when pause state already carries the clock');
delayedReadyRenderer.dispose();

var reusableConstructions = 0;
var reusableDisposals = 0;
var reusableTracks = [];
function ReusableSubtitlesOctopus(options) {
  reusableConstructions += 1;
  this.dispose = function () { reusableDisposals += 1; };
  this.setCurrentTime = function () {};
  this.setIsPaused = function () {};
  this.setTrack = function (content) { reusableTracks.push(content); };
  this.getEvents = function (success) { success([]); };
  options.onReady();
}
var reusableRenderer = Renderer.create({
  root: { SubtitlesOctopus: ReusableSubtitlesOctopus },
  document: documentRef,
  canvas: { className: '', style: {}, width: 0, height: 0 },
  SubtitlesOctopus: ReusableSubtitlesOctopus
});
reusableRenderer.load('[Script Info]\nTitle: warmup', function (error) { loadError = error; });
assert.strictEqual(loadError, null);
reusableRenderer.load('[Script Info]\nTitle: real track', function (error) { loadError = error; });
assert.strictEqual(loadError, null, 'warm track replacement must complete after the worker acknowledges it');
assert.strictEqual(reusableConstructions, 1, 'a responsive renderer must reuse its existing worker');
assert.strictEqual(reusableDisposals, 0, 'warm track replacement must not dispose libass');
assert.deepStrictEqual(reusableTracks, ['[Script Info]\nTitle: real track'], 'warm replacement must send only the new track through setTrack');
reusableRenderer.dispose();



var prewarmLoads = 0;
var prewarmConstructions = 0;
function PrewarmSubtitlesOctopus() { prewarmConstructions += 1; }
delete require.cache[require.resolve('../app/libass-subtitle-renderer')];
var FreshRenderer = require('../app/libass-subtitle-renderer');
var prewarmRenderer = FreshRenderer.create({
  root: {},
  document: documentRef,
  canvas: { className: '', style: {}, width: 0, height: 0 },
  loadScript: function (_url, callback) { prewarmLoads += 1; callback(null, PrewarmSubtitlesOctopus); }
});
var prewarmError = 'pending';
prewarmRenderer.prewarm(function (error) { prewarmError = error || null; });
assert.strictEqual(prewarmError, null, 'renderer library prewarm must complete when the wrapper script is available');
assert.strictEqual(prewarmLoads, 1, 'renderer library prewarm must load JavascriptSubtitlesOctopus once');
assert.strictEqual(prewarmConstructions, 0, 'library-only prewarm must not construct or claim a worker before real ASS content is known');
prewarmRenderer.dispose();

var diagnosticCanvas = { className: '', style: {}, width: 0, height: 0 };
var diagnosticRenderer = Renderer.create({
  root: { SubtitlesOctopus: FakeSubtitlesOctopus },
  document: documentRef,
  canvas: diagnosticCanvas,
  videoDimensions: function () { return { width: 1280, height: 720 }; },
  SubtitlesOctopus: FakeSubtitlesOctopus,
  debug: true
});
diagnosticRenderer.load('[Script Info]\nTitle: diagnostic', function (error) { loadError = error; });
assert.strictEqual(loadError, null, 'diagnostic ASS renderer must still initialize');
assert.strictEqual(created.debug, true, 'ASS renderer diagnostics may opt into SubtitlesOctopus debug logging explicitly');
diagnosticRenderer.dispose();

var synchronousFailureDisposed = 0;
var synchronousFailureTimeCalls = 0;
var synchronousFailureError = null;
function SynchronousFailingSubtitlesOctopus(options) {
  this.dispose = function () { synchronousFailureDisposed += 1; };
  this.setCurrentTime = function () { synchronousFailureTimeCalls += 1; };
  options.onError(new Error('synchronous worker failure'));
}
var synchronousFailureRenderer = Renderer.create({
  root: { SubtitlesOctopus: SynchronousFailingSubtitlesOctopus },
  document: documentRef,
  canvas: { className: '', style: {}, width: 0, height: 0 },
  SubtitlesOctopus: SynchronousFailingSubtitlesOctopus
});
synchronousFailureRenderer.load('[Script Info]\nTitle: synchronous failure', function (error) { synchronousFailureError = error; });
assert.ok(synchronousFailureError, 'a synchronous JavascriptSubtitlesOctopus startup error must fail the load');
assert.strictEqual(synchronousFailureDisposed, 1, 'a renderer that fails synchronously during construction must be disposed after the constructor returns');
synchronousFailureRenderer.setTime(10, false);
assert.strictEqual(synchronousFailureTimeCalls, 0, 'a synchronously failed renderer must not remain attached after load failure');

var runtimeFailureOptions;
var runtimeFailureInstance;
var runtimeFailureDisposed = 0;
var runtimeFailureTimeCalls = 0;
var runtimeFailures = [];
var runtimeFailureTimeCallsAfterReady;
function RuntimeFailingSubtitlesOctopus(options) {
  runtimeFailureOptions = options;
  runtimeFailureInstance = this;
  this.dispose = function () { runtimeFailureDisposed += 1; };
  this.setCurrentTime = function () { runtimeFailureTimeCalls += 1; };
  options.onReady();
}
var runtimeFailureRenderer = Renderer.create({
  root: { SubtitlesOctopus: RuntimeFailingSubtitlesOctopus },
  document: documentRef,
  canvas: { className: '', style: {}, width: 0, height: 0 },
  SubtitlesOctopus: RuntimeFailingSubtitlesOctopus,
  onRuntimeError: function (error) { runtimeFailures.push(error); }
});
runtimeFailureRenderer.load('[Script Info]\nTitle: runtime failure', function (error) { loadError = error; });
assert.strictEqual(loadError, null, 'the ASS renderer must complete startup before a later worker failure');
runtimeFailureTimeCallsAfterReady = runtimeFailureTimeCalls;
runtimeFailureOptions.onError(new Error('late worker failure'));
runtimeFailureInstance.dispose();
assert.strictEqual(runtimeFailures.length, 1, 'a critical ASS worker failure after readiness must be surfaced to the runtime owner');
assert.strictEqual(runtimeFailureDisposed, 1, 'the wrapper must not dispose a late failed worker a second time before JavascriptSubtitlesOctopus performs its own teardown');
runtimeFailureRenderer.setTime(20, false);
assert.strictEqual(runtimeFailureTimeCalls, runtimeFailureTimeCallsAfterReady, 'a late failed ASS worker must not keep receiving playback clock updates');

var diagnosticRuntimeFailureOptions;
var diagnosticRuntimeFailureDisposed = 0;
function DiagnosticRuntimeFailingSubtitlesOctopus(options) {
  diagnosticRuntimeFailureOptions = options;
  this.dispose = function () { diagnosticRuntimeFailureDisposed += 1; };
  this.setCurrentTime = function () {};
  options.onReady();
}
var diagnosticRuntimeFailureRenderer = Renderer.create({
  root: { SubtitlesOctopus: DiagnosticRuntimeFailingSubtitlesOctopus },
  document: documentRef,
  canvas: { className: '', style: {}, width: 0, height: 0 },
  SubtitlesOctopus: DiagnosticRuntimeFailingSubtitlesOctopus,
  debug: true,
  onRuntimeError: function () {}
});
diagnosticRuntimeFailureRenderer.load('[Script Info]\nTitle: diagnostic runtime failure', function (error) { loadError = error; });
assert.strictEqual(loadError, null, 'diagnostic ASS renderer must initialize before a late failure');
diagnosticRuntimeFailureOptions.onError(new Error('diagnostic late worker failure'));
assert.strictEqual(diagnosticRuntimeFailureDisposed, 1, 'debug ASS runtime failures must still release the worker when JavascriptSubtitlesOctopus skips its automatic teardown');

var sizingStyles = [];
function SizingSubtitlesOctopus(options) {
  this.dispose = function () {};
  this.setCurrentTime = function () {};
  this.getStyles = function (success) {
    success([{ _index: 0, FontSize: 20 }, { _index: 1, FontSize: 40 }]);
  };
  this.setStyle = function (style, index) { sizingStyles.push([index, style.FontSize]); };
  options.onReady();
}
var sizingRenderer = Renderer.create({
  root: { SubtitlesOctopus: SizingSubtitlesOctopus },
  document: documentRef,
  canvas: { className: '', style: {}, width: 0, height: 0 },
  SubtitlesOctopus: SizingSubtitlesOctopus
});
sizingRenderer.load('[Script Info]\nTitle: size', function (error) { loadError = error; });
assert.strictEqual(loadError, null, 'sized ASS renderer must initialize normally');
sizingRenderer.setSize(150);
assert.deepStrictEqual(sizingStyles.slice(-2), [[0, 30], [1, 60]], '150% ASS size must scale every libass style from its original font size');
sizingRenderer.setSize(75);
assert.deepStrictEqual(sizingStyles.slice(-2), [[0, 15], [1, 30]], 'later ASS size changes must rescale the original styles instead of compounding the previous size');
sizingRenderer.dispose();

var fallbackSizingStyles = [];
function FallbackSizingSubtitlesOctopus(options) {
  this.dispose = function () {};
  this.setCurrentTime = function () {};
  this.getStyles = function (success) { success([{ _index: 0, FontSize: 80 }]); };
  this.setStyle = function (style, index) { fallbackSizingStyles.push([index, style.FontSize]); };
  options.onReady();
}
var fallbackSizingRenderer = Renderer.create({
  root: { SubtitlesOctopus: FallbackSizingSubtitlesOctopus },
  document: documentRef,
  canvas: { className: '', style: {}, width: 0, height: 0 },
  SubtitlesOctopus: FallbackSizingSubtitlesOctopus,
  availableFontNames: []
});
fallbackSizingRenderer.load('[Script Info]\nPlayResX: 1920\nPlayResY: 1080\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize\nStyle: Default,Sub Alegreya,80', function (error) { loadError = error; });
assert.strictEqual(loadError, null, 'fallback-sized ASS renderer must initialize normally');
fallbackSizingRenderer.setSize(75);
assert.deepStrictEqual(fallbackSizingStyles.slice(-1), [[0, 45]], 'unavailable ASS fonts must receive the fallback compensation factor');
fallbackSizingRenderer.setSize(100);
assert.deepStrictEqual(fallbackSizingStyles.slice(-1), [[0, 60]], 'fallback compensation must use the original style size without compounding');
fallbackSizingRenderer.dispose();

var availableSizingStyles = [];
function AvailableSizingSubtitlesOctopus(options) {
  this.dispose = function () {};
  this.setCurrentTime = function () {};
  this.getStyles = function (success) { success([{ _index: 0, FontSize: 80 }]); };
  this.setStyle = function (style, index) { availableSizingStyles.push([index, style.FontSize]); };
  options.onReady();
}
var availableSizingRenderer = Renderer.create({
  root: { SubtitlesOctopus: AvailableSizingSubtitlesOctopus },
  document: documentRef,
  canvas: { className: '', style: {}, width: 0, height: 0 },
  SubtitlesOctopus: AvailableSizingSubtitlesOctopus,
  availableFontNames: ['Sub Alegreya']
});
availableSizingRenderer.load('[V4+ Styles]\nFormat: Name,Fontname,Fontsize\nStyle: Default,Sub Alegreya,80', function (error) { loadError = error; });
availableSizingRenderer.setSize(75);
assert.deepStrictEqual(availableSizingStyles.slice(-1), [[0, 60]], 'available ASS fonts must keep the authored size scale');
availableSizingRenderer.dispose();

var retrySizingReads = 0;
var retrySizingStyles = [];
function RetrySizingSubtitlesOctopus(options) {
  this.dispose = function () {};
  this.setCurrentTime = function () {};
  this.getStyles = function (success, failure) {
    retrySizingReads += 1;
    if (retrySizingReads === 1) { failure(new Error('styles not ready')); return; }
    success([{ _index: 0, FontSize: 24 }]);
  };
  this.setStyle = function (style, index) { retrySizingStyles.push([index, style.FontSize]); };
  options.onReady();
}
var retrySizingRenderer = Renderer.create({
  root: { SubtitlesOctopus: RetrySizingSubtitlesOctopus },
  document: documentRef,
  canvas: { className: '', style: {}, width: 0, height: 0 },
  SubtitlesOctopus: RetrySizingSubtitlesOctopus
});
retrySizingRenderer.load('[Script Info]\nTitle: delayed styles', function (error) { loadError = error; });
assert.strictEqual(loadError, null, 'ASS startup must not fail only because style inspection is not ready yet');
retrySizingRenderer.setSize(150);
assert.strictEqual(retrySizingReads, 2, 'a size change must retry ASS style discovery after an early worker style-read failure');
assert.deepStrictEqual(retrySizingStyles, [[0, 36]], 'retried style discovery must apply the requested size once styles become available');
retrySizingRenderer.dispose();


var uhdCanvas = { className: '', style: {}, width: 0, height: 0 };
var uhdRenderer = Renderer.create({
  root: { SubtitlesOctopus: FakeSubtitlesOctopus },
  document: { documentElement: { clientWidth: 1920, clientHeight: 1080 } },
  canvas: uhdCanvas,
  videoDimensions: function () { return { width: 3840, height: 2160 }; },
  SubtitlesOctopus: FakeSubtitlesOctopus
});
uhdRenderer.load('[Script Info]\nTitle: UHD source', function (error) { loadError = error; });
assert.strictEqual(loadError, null, 'UHD ASS renderer must still initialize normally');
assert.deepStrictEqual([uhdCanvas.width, uhdCanvas.height], [1920, 1080],
  'local ASS rendering must target the 1920x1080 webOS UI viewport instead of allocating a 4K canvas for a UHD source');
uhdRenderer.dispose();

var rendererSource = fs.readFileSync(path.join(__dirname, '..', 'app', 'libass-subtitle-renderer.js'), 'utf8');
assert.strictEqual((rendererSource.match(/target\.getEvents\(/g) || []).length, 1,
  'initial startup and warm-track replacement must share one worker-readiness probe implementation');

(function firstRealTrackWaitsForFallbackStyleNormalizationBeforeReady() {
  var styleSuccess = null;
  var styleWrites = [];
  var result = 'pending';
  function DeferredStyleSubtitlesOctopus(options) {
    this.dispose = function () {};
    this.resize = function () {};
    this.setCurrentTime = function () {};
    this.setIsPaused = function () {};
    this.getEvents = function (success) { success([]); };
    this.getStyles = function (success) { styleSuccess = success; };
    this.setStyle = function (style, index) { styleWrites.push([index, style.FontSize]); };
    options.onReady();
  }
  var target = Renderer.create({
    root: { SubtitlesOctopus: DeferredStyleSubtitlesOctopus },
    document: documentRef,
    canvas: { className: 'is-hidden', style: {}, width: 0, height: 0 },
    SubtitlesOctopus: DeferredStyleSubtitlesOctopus,
    availableFontNames: []
  });
  target.load('[Script Info]\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize\nStyle: Default,Missing Font,80', function (error) {
    result = error || null;
  });
  assert.strictEqual(result, 'pending',
    'first real ASS track must not become ready before fallback-dependent style normalization completes');
  assert.strictEqual(typeof styleSuccess, 'function', 'first real ASS load must request the active libass styles');
  styleSuccess([{ _index: 0, FontSize: 80 }]);
  assert.strictEqual(result, null, 'ASS track may become ready once its initial style normalization is complete');
  assert.deepStrictEqual(styleWrites, [[0, 60]],
    'fallback-dependent first frame must be normalized before playback can expose the track');
  target.dispose();
}());

(function hiddenAssSizeNormalizationDoesNotRenderTheWarmClock() {
  var currentTimeWrites = [];
  function HiddenSizingSubtitlesOctopus(options) {
    this.dispose = function () {};
    this.resize = function () {};
    this.setCurrentTime = function (value) { currentTimeWrites.push(value); };
    this.setIsPaused = function () {};
    this.getEvents = function (success) { success([]); };
    this.getStyles = function (success) { success([{ _index: 0, FontSize: 80 }]); };
    this.setStyle = function () {};
    options.onReady();
  }
  var hiddenCanvas = { className: 'is-hidden', style: {}, width: 0, height: 0 };
  var target = Renderer.create({
    root: { SubtitlesOctopus: HiddenSizingSubtitlesOctopus },
    document: documentRef,
    canvas: hiddenCanvas,
    SubtitlesOctopus: HiddenSizingSubtitlesOctopus,
    availableFontNames: []
  });
  target.load('[Script Info]\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize\nStyle: Default,Missing Font,80', function (error) { loadError = error; });
  assert.strictEqual(loadError, null);
  currentTimeWrites.length = 0;
  target.setSize(100);
  assert.deepStrictEqual(currentTimeWrites, [],
    'size normalization while the ASS overlay is hidden must not render the stale warmup clock');
  target.show();
  target.setTime(37.25, true);
  currentTimeWrites.length = 0;
  target.setSize(75);
  assert.deepStrictEqual(currentTimeWrites, [37.25],
    'an interactive size change on a visible ASS overlay must still redraw at the current playback clock');
  target.dispose();
}());

(function revealingAssOverlayClearsAnyPreparedStaleFrameOnce() {
  var clears = 0;
  var context = { clearRect: function () { clears += 1; } };
  var targetCanvas = {
    className: 'is-hidden', style: {}, width: 1280, height: 720,
    getContext: function () { return context; }
  };
  var target = Renderer.create({
    root: { SubtitlesOctopus: FakeSubtitlesOctopus },
    document: documentRef,
    canvas: targetCanvas,
    SubtitlesOctopus: FakeSubtitlesOctopus
  });
  target.load('[Script Info]\nTitle: stale prepared canvas', function (error) { loadError = error; });
  assert.strictEqual(loadError, null);
  clears = 0;
  target.show();
  assert.strictEqual(clears, 1,
    'revealing a hidden ASS overlay must clear any frame prepared at the previous warmup/playback clock');
  target.show();
  assert.strictEqual(clears, 1, 'an already visible ASS overlay must not be cleared on every render tick');
  target.dispose();
}());


(function hiddenPreparedTrackWaitsForFirstRealClockBeforeReleasingWorkerFrames() {
  var operations = [];
  function GatedSubtitlesOctopus(options) {
    this.dispose = function () {};
    this.resize = function () {};
    this.setWorkerFrameSuppressed = function (value) { operations.push(['suppress', value]); };
    this.releaseWorkerFramesAt = function (seconds, isPaused, callback) { operations.push(['release', seconds, isPaused]); if (typeof callback === 'function') { callback(); } };
    this.setCurrentTime = function (value) { operations.push(['time', value]); };
    this.setIsPaused = function (value, seconds) { operations.push(['pause', value, seconds]); };
    this.getEvents = function (success) { success([]); };
    this.getStyles = function (success) { success([{ _index: 0, FontSize: 40 }]); };
    this.setStyle = function () {};
    options.onReady();
  }
  var target = Renderer.create({
    root: { SubtitlesOctopus: GatedSubtitlesOctopus },
    document: documentRef,
    canvas: { className: 'is-hidden', style: {}, width: 0, height: 0 },
    SubtitlesOctopus: GatedSubtitlesOctopus
  });
  target.load('[Script Info]\nTitle: first real track', function (error) { loadError = error; });
  assert.strictEqual(loadError, null);
  assert.strictEqual(operations.some(function (entry) { return entry[0] === 'pause' || entry[0] === 'time'; }), false,
    'hidden ASS preparation must not push the warmup clock into the real track');
  assert.ok(operations.some(function (entry) { return entry[0] === 'suppress' && entry[1] === true; }),
    'real-track preparation must keep worker frames suppressed until a playback clock is available');
  target.show();
  assert.strictEqual(operations.some(function (entry) { return entry[0] === 'release'; }), false,
    'revealing the overlay must not release speculative frames before the first real playback clock');
  target.setTime(37.25, true);
  assert.deepStrictEqual(operations.filter(function (entry) { return entry[0] === 'release'; }), [['release', 37.25, true]],
    'the first playback clock must atomically release the prepared track at the real media position');
  target.setTime(38, true);
  assert.strictEqual(operations.filter(function (entry) { return entry[0] === 'release'; }).length, 1,
    'frame-gate release must be a one-shot transition per loaded ASS track');
  target.dispose();
}());


(function suspendPausesWarmWorkerAndInvalidatesPreparedLookaheadWithoutDisposal() {
  var operations = [];
  var disposedCount = 0;
  function SuspendableSubtitlesOctopus(options) {
    this.dispose = function () { disposedCount += 1; };
    this.resize = function () {};
    this.setCurrentTime = function (seconds) { operations.push(['time', seconds]); };
    this.setIsPaused = function (value, seconds) { operations.push(['pause', value, seconds]); };
    this.markDiscontinuity = function (seconds) { operations.push(['discontinuity', seconds]); };
    this.getEvents = function (success) { success([]); };
    this.getStyles = function (success) { success([{ _index: 0, FontSize: 40 }]); };
    this.setStyle = function () {};
    options.onReady();
  }
  var target = Renderer.create({
    root: { SubtitlesOctopus: SuspendableSubtitlesOctopus },
    document: documentRef,
    canvas: { className: '', style: {}, width: 0, height: 0 },
    SubtitlesOctopus: SuspendableSubtitlesOctopus
  });
  target.load('[Script Info]\nTitle: suspend', function (error) { loadError = error; });
  assert.strictEqual(loadError, null);
  target.setTime(88.5, false);
  operations = [];
  target.suspend();
  assert.ok(operations.some(function (entry) { return entry[0] === 'discontinuity' && entry[1] === 88.5; }),
    'suspending a pooled renderer must invalidate prepared frames at the last absolute clock');
  assert.ok(operations.some(function (entry) { return entry[0] === 'pause' && entry[1] === true && entry[2] === 88.5; }),
    'suspending a pooled renderer must stop autonomous worker rendering at the last absolute clock');
  assert.strictEqual(disposedCount, 0, 'suspend must keep the warmed worker alive for later reuse');
  target.dispose();
  assert.strictEqual(disposedCount, 1);
}());

console.log('JavascriptSubtitlesOctopus renderer checks passed');
