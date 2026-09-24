'use strict';

var assert = require('assert');
var WarmMetrics = require('../app/startup-metrics');
(function firstFrameTestNeedsNoUnboundedCapture() {
  var time = 0;
  var metrics = WarmMetrics.createAssColdStartMetrics({ warmTest: true, now: function () { return time; } });
  assert.strictEqual(metrics.recordAssSync('renderer', { requestedTime: 1 }), true);
  metrics.recordAssSync('worker-frame', { bitmapCount: 0, libassMs: 1 });
  metrics.recordAssSync('worker-frame', { bitmapCount: 1, libassMs: 7000, blendMs: 12 });
  time = 15000;
  metrics.recordAssSync('raf-presented', { bitmapCount: 1, rafMs: 20 });
  assert.deepStrictEqual(metrics.firstRenderProfile(), { libassMs: 7000, blendMs: 12, presentedAt: 15000, rafMs: 20 });
  assert.deepStrictEqual(metrics.syncTrace(), [], 'test panel must not enable raw trace retention');
  assert.strictEqual(metrics.recordAssSync('renderer', { requestedTime: 2 }), false, 'stop per-frame callbacks after first visible frame');
}());
var StartupMetrics = require('../app/startup-metrics');
var DebugCapture = require('../app/debug-capture');

(function recordsNamedMonotonicMilestonesWithoutSideEffects() {
  var values = [100, 100, 135, 125, 180, 210];
  var metrics = StartupMetrics.create({ now: function () { return values.shift(); } });
  assert.strictEqual(metrics.mark('bootstrap'), 0, 'bootstrap should be measured from collector creation');
  assert.strictEqual(metrics.mark('composition-ready'), 35, 'composition-ready should record elapsed startup time');
  assert.strictEqual(metrics.mark('server-ready'), 35, 'milestones must remain monotonic if the underlying clock regresses');
  assert.strictEqual(metrics.mark('first-home-content'), 80, 'home content should retain its elapsed milestone');
  assert.strictEqual(metrics.mark('first-focusable-ui'), 110, 'focusable UI should retain its elapsed milestone');
  assert.deepStrictEqual(metrics.snapshot(), {
    bootstrap: 0,
    compositionReady: 35,
    serverReady: 35,
    firstHomeContent: 80,
    firstFocusableUi: 110,
    playerLoadStart: null, playerCodeReady: null, playerFeatureReady: null
  });
  assert.strictEqual(metrics.mark('bootstrap'), 0, 'duplicate marks must not overwrite the first observation');
  assert.strictEqual(metrics.mark('unknown'), null, 'unknown milestones must be ignored');
}());

(function resetStartsANewBoundedMeasurementWindow() {
  var values = [10, 12, 100, 105];
  var metrics = StartupMetrics.create({ now: function () { return values.shift(); } });
  metrics.mark('bootstrap');
  assert.strictEqual(metrics.reset(), true);
  assert.deepStrictEqual(metrics.snapshot(), {
    bootstrap: null,
    compositionReady: null,
    serverReady: null,
    firstHomeContent: null,
    firstFocusableUi: null,
    playerLoadStart: null, playerCodeReady: null, playerFeatureReady: null
  });
  assert.strictEqual(metrics.mark('bootstrap'), 5, 'reset must use a fresh local origin');
}());


(function recordsBoundedAssColdStartPhasesWithoutSensitiveContext() {
  var values = [1000, 1005, 1010, 1015, 1020, 1025, 1030, 1035, 1040, 1045, 1050, 1055, 1060, 1065, 1070];
  var metrics = StartupMetrics.createAssColdStartMetrics({ now: function () { return values.shift(); } });
  metrics.mark('workerRequested');
  metrics.mark('workerCreated');
  metrics.mark('workerInitSent');
  metrics.recordWorkerTiming('static-memory-end');
  metrics.recordWorkerTiming('worker-init-received');
  metrics.recordWorkerTiming('font-request');
  metrics.recordWorkerTiming('font-loaded');
  metrics.recordWorkerTiming('libass-runtime-ready');
  metrics.recordWorkerTiming('warm-track-ready');
  metrics.recordWorkerTiming('first-render-message');
  metrics.beginRealAssFetch();
  metrics.endRealAssFetch();
  metrics.beginRealAssSetTrack();
  metrics.recordWorkerTiming('first-render-message');
  metrics.endRealAssSetTrack();
  assert.deepStrictEqual(metrics.snapshot(), {
    workerRequested: 5,
    workerCreated: 10,
    staticMemoryReady: 20,
    workerInitSent: 15,
    workerInitReceived: 25,
    fontRequested: 30,
    fontReady: 35,
    libassRuntimeReady: 40,
    warmTrackReady: 45,
    warmFirstFrame: 50,
    realAssFetchStart: 55,
    realAssFetchEnd: 60,
    realAssSetTrackStart: 65,
    realAssSetTrackReady: 70,
    firstRealAssFrame: 70
  }, 'ASS cold-start telemetry must expose only bounded numeric phases');
}());

(function assSyncDiagnosticsAreOffNormallyAndUnboundedOnlyInsideManualCapture() {
  var now = 5000;
  var capture = DebugCapture.create({ now: function () { return now; }, wallNow: function () { return 100000 + now; } });
  var metrics = StartupMetrics.createAssColdStartMetrics({
    now: function () { return now; },
    debugCapture: capture
  });
  var index;
  var trace;
  metrics.beginRealAssSetTrack();
  now = 5010;
  metrics.endRealAssSetTrack();
  now = 5020;
  assert.strictEqual(metrics.recordAssSync('worker-frame', {
    mediaTime: 100, clockAnchor: 100, clockAgeMs: 0, renderMs: 3000, libassMs: 2990, blendMs: 10,
    bitmapCount: 2, pixelCount: 40000, renderCount: 1, changedRenderCount: 1,
    frameSeq: 1, frameFingerprint: '12ab34cd', trackAnimated: false, effectiveTargetFps: 0,
    playbackEpoch: 0, boundaryIndex: 4, validFrom: 99, validUntil: 101,
    frameSuppressed: true, workerPaused: true, renderReason: 'boundary', secret: 'must-not-leak'
  }), false, 'normal playback must not retain continuous ASS sync telemetry before manual debug start');
  assert.deepStrictEqual(metrics.syncTrace(), [], 'normal Ploff startup must expose no raw ASS history');
  assert.strictEqual(metrics.snapshot().sync, undefined,
    'continuous ASS aggregate telemetry must also remain absent until debug capture is explicitly active');

  capture.start();
  now = 5030;
  assert.strictEqual(metrics.recordAssSync('controller', {
    nativeTime: 100, publicTime: 100, subtitleTime: 100, nativeTrusted: true, paused: false, secret: 'nope'
  }), true, 'manual capture must activate ASS sync tracing');
  for (index = 0; index < 1500; index += 1) {
    now += 100;
    metrics.recordAssSync('renderer', { requestedTime: 100 + index / 10, paused: false, frameReleasePending: false });
  }
  now += 120000;
  metrics.recordAssSync('prepared-frame', {
    mediaTime: 162, expectedTime: 161.5, playbackEpoch: 2, renderGeneration: 4, boundaryIndex: 12,
    validFrom: 162, validUntil: 164, preparedDepth: 3, preparedBytes: 1024, leadMs: 500, reason: '', secret: 'nope'
  });
  trace = metrics.syncTrace();
  assert.ok(trace.length >= 1502,
    'manual ASS trace must no longer evict after sixty seconds or 1024 entries');
  assert.strictEqual(trace.some(function (entry) { return entry.secret !== undefined; }), false,
    'manual ASS trace must preserve the existing privacy allowlist');
  assert.strictEqual(trace[trace.length - 1].stage, 'prepared-frame');
  assert.strictEqual(trace[trace.length - 1].renderGeneration, 4);
  assert.strictEqual(trace[trace.length - 1].preparedBytes, 1024);
  assert.ok(metrics.snapshot().sync.sampleCount >= 1502,
    'ASS aggregate timing may be collected while the explicit debug session is active');
  capture.stop();
  now += 10;
  assert.strictEqual(metrics.recordAssSync('controller', {
    nativeTime: 200, publicTime: 200, subtitleTime: 200, nativeTrusted: true, paused: false
  }), false, 'stopping manual debug capture must immediately stop continuous ASS collection');
}());

(function inactiveDebugCaptureDoesNotAllocateStatusObjectsOnHotAssSyncPath() {
  var statusCalls = 0;
  var metrics = StartupMetrics.createAssColdStartMetrics({
    now: function () { return 1; },
    debugCapture: {
      isActive: function () { return false; },
      status: function () { statusCalls += 1; return { active: false, generation: 0 }; },
      record: function () { throw new Error('inactive capture must never record'); }
    }
  });
  assert.strictEqual(metrics.recordAssSync('controller', { nativeTime: 1, publicTime: 1, subtitleTime: 1 }), false);
  metrics.snapshot();
  assert.strictEqual(statusCalls, 0,
    'normal playback must use the boolean inactive gate without allocating capture status objects on ASS sync/snapshot hot paths');
}());

(function startupMetricsCanAttachToDebugCaptureLoadedLaterInTheAppBundle() {
  var root = {};
  var capture = DebugCapture.create({ now: function () { return 10; }, wallNow: function () { return 20; } });
  var metrics = StartupMetrics.createAssColdStartMetrics({ root: root, now: function () { return 10; } });
  assert.strictEqual(metrics.recordAssSync('controller', { nativeTime: 1, publicTime: 1, subtitleTime: 1 }), false,
    'startup metrics must remain inactive before the later app bundle installs PloffDebugCapture');
  root.PloffDebugCapture = capture;
  capture.start();
  assert.strictEqual(metrics.recordAssSync('controller', { nativeTime: 2, publicTime: 2, subtitleTime: 2 }), true,
    'startup metrics must resolve the capture lazily after app.js installs it');
  assert.strictEqual(capture.export().events.some(function (entry) { return entry.category === 'ass'; }), true);
}());

console.log('Startup metrics checks passed');

(function assWorkerPreloadHonorsPersistedGlobalAssSetting() {
  assert.strictEqual(typeof StartupMetrics.assRenderingEnabledAtStartup, 'function',
    'startup metrics must expose the ASS preload gate used by the browser bootstrap');
  function storage(values) {
    return { getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; } };
  }
  assert.strictEqual(StartupMetrics.assRenderingEnabledAtStartup({ localStorage: storage({}) }), false,
    'ASS worker preload must stay disabled when no persisted opt-in exists');
  assert.strictEqual(StartupMetrics.assRenderingEnabledAtStartup({ localStorage: storage({
    'ploff.settings.v3': JSON.stringify({ version: 3, subtitleRenderingAss: false })
  }) }), false, 'ASS worker preload must stay disabled when the global option is off');
  assert.strictEqual(StartupMetrics.assRenderingEnabledAtStartup({ localStorage: storage({
    'ploff.settings.v3': JSON.stringify({ version: 3, subtitleRenderingAss: true })
  }) }), true, 'ASS worker preload must start when the global ASS option is explicitly enabled');
  assert.strictEqual(StartupMetrics.assRenderingEnabledAtStartup({ localStorage: storage({
    'ploff.settings.v3': '{broken-json'
  }) }), false, 'corrupt settings must fail closed and avoid speculative ASS work');
}());
